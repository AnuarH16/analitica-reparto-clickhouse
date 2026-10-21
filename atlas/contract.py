"""Versioned event contract. No inferred relationships between public datasets."""
from datetime import datetime, timedelta, timezone
from uuid import UUID

ACTIONS = {'search', 'filter_applied', 'restaurant_opened', 'product_opened',
           'product_impression', 'cart_added', 'cart_removed', 'session_abandoned', 'order_submitted'}
KINDS = {'synthetic', 'demo_live', 'public_historical', 'historical_replay'}
REQUIRED = {'schema_version', 'event_id', 'session_id', 'event_time', 'event_type',
            'section', 'city_id', 'source', 'source_kind'}
OPTIONAL = {'user_id', 'restaurant_id', 'product_id', 'source_record_id', 'simulation_run_id','order_id'}

def validate(event):
    if not isinstance(event, dict):
        raise ValueError('Each event must be a JSON object.')
    if REQUIRED - event.keys() or event.keys() - REQUIRED - OPTIONAL:
        raise ValueError('Missing required fields or unknown fields.')
    if type(event['schema_version']) is not int or event['schema_version'] != 1:
        raise ValueError('schema_version must be 1.')
    out = dict(event)
    for key in REQUIRED - {'schema_version'}:
        if not isinstance(out[key], str) or not 0 < len(out[key]) <= 160 or '\x00' in out[key]:
            raise ValueError(f'{key}: required string, maximum 160 characters.')
    for key in ('event_id', 'session_id'):
        out[key] = str(UUID(out[key]))
    if out['event_type'] not in ACTIONS or out['source_kind'] not in KINDS:
        raise ValueError('Action or provenance not supported.')
    at = datetime.fromisoformat(out['event_time'].replace('Z', '+00:00'))
    if at.tzinfo is None:
        raise ValueError('event_time must include a time zone.')
    at = at.astimezone(timezone.utc)
    if not datetime(2000, 1, 1, tzinfo=timezone.utc) <= at <= datetime.now(timezone.utc) + timedelta(minutes=5):
        raise ValueError('Date outside the allowed range (2000 to now + 5 minutes).')
    out['event_time'] = at.isoformat(timespec='milliseconds')
    for key in OPTIONAL:
        # Do not change the canonical payload/digest of a legacy retry.
        if key=='order_id' and key not in out:
            continue
        value = out.get(key)
        if value is not None and (not isinstance(value, str) or not 0 < len(value) <= 160 or '\x00' in value):
            raise ValueError(f'{key}: string of up to 160 characters or null.')
        out[key] = value
    if out['simulation_run_id'] is not None:
        out['simulation_run_id'] = str(UUID(out['simulation_run_id']))
    if out.get('order_id') is not None:
        out['order_id']=str(UUID(out['order_id']))
    if out['source_kind'] == 'synthetic' and not out['simulation_run_id']:
        raise ValueError('A simulation needs simulation_run_id.')
    if out['source_kind'] in {'public_historical', 'historical_replay'} and not out['source_record_id']:
        raise ValueError('A historical source needs source_record_id.')
    if out['event_type'] in {'restaurant_opened', 'product_opened', 'product_impression', 'cart_added','cart_removed', 'order_submitted'} and not out['restaurant_id']:
        raise ValueError('This action needs restaurant_id.')
    if out['event_type'] in {'product_opened', 'product_impression', 'cart_added','cart_removed'} and not out['product_id']:
        raise ValueError('This action needs product_id.')
    return out
