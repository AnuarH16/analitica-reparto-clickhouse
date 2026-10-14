"""Independent decision/GPS workers sharing a queue-committed commerce engine."""
import copy
import threading
import time
from datetime import datetime,timezone
from uuid import uuid4
from atlas.commerce import CommerceEngine
from atlas.customer_agent import OllamaAgent,PolicyAgent
from atlas.simulation import iso


class CustomerRuntime:
    def __init__(self,store,ch,fleet,customers,interval,seed,agent_mode):
        self.store=store;self.lock=threading.RLock();self.cancel=threading.Event()
        self.decider=OllamaAgent() if agent_mode=='ollama' else PolicyAgent()
        if agent_mode=='ollama' and not self.decider.ready():
            raise ValueError('Modelo local no disponible. Arranca Ollama y descarga qwen3:0.6b; o elige política local.')
        catalog={'restaurants':ch.query('SELECT * EXCEPT version FROM delivery_atlas.demo_restaurants FINAL ORDER BY restaurant_id'),
            'products':ch.query('SELECT * EXCEPT version FROM delivery_atlas.demo_products FINAL ORDER BY product_id')}
        now=datetime.now(timezone.utc)
        self.engine=CommerceEngine(str(uuid4()),now,fleet,customers,seed,catalog,agent_mode,self.decider.model)
        self.state={'run_id':self.engine.run_id,'started_at':iso(now),'fleet':fleet,'customers':customers,
            'interval_seconds':interval,'seed':seed,'mode':'customers','agent_mode':agent_mode,
            'model':self.decider.model,'running':True,'state':'running','ticks':0,'accepted':0,
            'error':None,'agent_error':None,'decisions':0,'model_calls':0,'max_model_calls':120,
            'agent_state':'running','last_tick_at':None,
            'meaning':'Clientes sintéticos: checkout crea pedidos y su tracking. Compras sin cobro real.'}
        self.thread=threading.Thread(target=self.run,daemon=True)
        self.agent_thread=threading.Thread(target=self.agent_loop,daemon=True)

    def snapshot(self):
        with self.lock:return dict(self.state)

    def commit(self,operation):
        # State is swapped only when the complete batch has been accepted by SQLite.
        # A failed/capacity-limited acceptance never creates a phantom purchase in memory.
        with self.lock:
            if self.cancel.is_set():return False
            candidate=copy.deepcopy(self.engine)
            rows=operation(candidate)
            if not rows:return False
            accepted=self.store.accept(rows)
            self.engine=candidate;self.state['accepted']+=accepted['accepted']
            return True

    def launch(self):
        self.commit(lambda engine:engine.advance(datetime.now(timezone.utc)))
        self.store.metadata('simulation',self.snapshot())
        self.thread.start();self.agent_thread.start()
        return self.snapshot()

    def stop(self):
        self.cancel.set();self.thread.join(3)
        # An already-running HTTP inference may complete later; its result is discarded.
        self.agent_thread.join(.1)
        return self.snapshot()

    def run(self):
        deadline=time.monotonic();previous=None
        try:
            while not self.cancel.is_set():
                now=datetime.now(timezone.utc)
                self.commit(lambda engine:engine.advance(now))
                with self.lock:
                    self.state['ticks']+=1;self.state['last_tick_at']=iso(now)
                    self.state['observed_interval_seconds']=None if previous is None else round((now-previous).total_seconds(),3)
                previous=now;deadline=max(deadline+self.state['interval_seconds'],time.monotonic())
                self.cancel.wait(max(0,deadline-time.monotonic()))
        except Exception:
            with self.lock:self.state['error']='La ingesta no pudo continuar. Comprueba la cola y reinicia la demo.'
        finally:
            self.cancel.set()
            with self.lock:self.state.update(running=False,state='stopped' if not self.state['error'] else 'error')
            self.store.metadata('simulation',self.snapshot())

    def agent_loop(self):
        cursor=0;failures=0
        while not self.cancel.is_set():
            with self.lock:
                ids=list(self.engine.customers);now=datetime.now(timezone.utc)
                cid=ids[cursor%len(ids)];cursor+=1;context=self.engine.context(cid,now)
                if self.state['model_calls']>=self.state['max_model_calls'] and self.decider.mode=='ollama':
                    self.state['agent_state']='limit_reached';return
            if context:
                try:
                    if self.decider.mode=='ollama':
                        with self.lock:self.state['model_calls']+=1
                    decision=self.decider.choose(context)
                    if self.cancel.is_set():return
                    committed=self.commit(lambda engine:engine.decide(cid,context['revision'],decision,datetime.now(timezone.utc)))
                    with self.lock:self.state['decisions']+=int(committed);self.state['agent_error']=None
                    failures=0
                except Exception:
                    failures+=1
                    with self.lock:self.state['agent_error']='Una decisión no pudo ejecutarse. Se reintentará; no se creó una compra inválida.'
                    if failures>=3:
                        with self.lock:self.state['agent_state']='error'
                        return
                    self.cancel.wait(2)
            self.cancel.wait(.5 if self.decider.mode=='ollama' else .3)
