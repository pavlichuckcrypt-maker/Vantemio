"""Selected existing Station response validator for isolated technical review.

No production schemas, model routing, prompts, runtime or transport are included.
Copyright 2026 Vantemio / Vitalii Pavlichuk. See NOTICE.md.
"""
import json

def validate_response_contract(value, schema):
    """Validate the station's bounded JSON contract, rejecting unsupported keywords.

    This is not a general JSON Schema engine. Unsupported or malformed contracts
    are explicit errors, including in optional branches that the answer omits.
    No external references, evaluation or network retrieval is performed.
    """
    import math
    types = {'object': lambda v: isinstance(v, dict),
             'array': lambda v: isinstance(v, list),
             'string': lambda v: isinstance(v, str),
             'boolean': lambda v: isinstance(v, bool),
             'null': lambda v: v is None,
             'integer': lambda v: type(v) is int,
             'number': lambda v: type(v) is int or type(v) is float and math.isfinite(v)}
    annotations = {'title', 'description', '$comment', 'default', 'examples'}
    counts = {'minItems', 'maxItems', 'minLength', 'maxLength', 'minProperties', 'maxProperties'}
    numbers = {'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum'}
    keywords = annotations | counts | numbers | {'type', 'properties', 'required', 'items',
        'additionalProperties', 'enum', 'const', 'uniqueItems', 'anyOf', 'allOf', 'oneOf', 'not'}
    contract_errors = []

    def check(s, path='$', depth=0):
        if depth > 64:
            contract_errors.append(path + ': schema nesting exceeds 64')
            return
        if isinstance(s, bool):
            return
        if not isinstance(s, dict):
            contract_errors.append(path + ': schema must be object or boolean')
            return
        for k, v in s.items():
            at = path + '/' + str(k)
            if k not in keywords:
                contract_errors.append(at + ': unsupported keyword')
            elif k == 'type':
                if not (isinstance(v, str) and v in types or
                        isinstance(v, list) and v and all(isinstance(t, str) and t in types for t in v)):
                    contract_errors.append(at + ': invalid type')
            elif k == 'properties':
                if not isinstance(v, dict):
                    contract_errors.append(at + ': expected object')
                else:
                    for name, child in v.items():
                        check(child, at + '/' + str(name), depth + 1)
            elif k in ('items', 'additionalProperties', 'not'):
                check(v, at, depth + 1)
            elif k in ('allOf', 'anyOf', 'oneOf'):
                if not isinstance(v, list) or not v:
                    contract_errors.append(at + ': expected nonempty schema array')
                else:
                    for i, child in enumerate(v):
                        check(child, at + '/' + str(i), depth + 1)
            elif k == 'required' and not (isinstance(v, list) and all(isinstance(x, str) for x in v)):
                contract_errors.append(at + ': expected string array')
            elif k == 'enum' and not (isinstance(v, list) and v):
                contract_errors.append(at + ': expected nonempty array')
            elif k in counts and not (type(v) is int and v >= 0):
                contract_errors.append(at + ': expected nonnegative integer')
            elif k in numbers and not types['number'](v):
                contract_errors.append(at + ': expected finite number')
            elif k == 'uniqueItems' and not isinstance(v, bool):
                contract_errors.append(at + ': expected boolean')

    def equal(a, b):
        # Python True == 1 must not turn a boolean into an allowed numeric enum.
        if isinstance(a, bool) or isinstance(b, bool):
            return type(a) is type(b) and a == b
        if isinstance(a, list) and isinstance(b, list):
            return len(a) == len(b) and all(equal(x, y) for x, y in zip(a, b))
        if isinstance(a, dict) and isinstance(b, dict):
            return a.keys() == b.keys() and all(equal(a[k], b[k]) for k in a)
        return a == b

    def validate(v, s, path='$', depth=0):
        errors = []
        def fail(keyword):
            errors.append({'path': path, 'keyword': keyword})
        if depth > 128:
            fail('depth_limit')
            return errors
        if isinstance(s, bool):
            if not s: fail('false_schema')
            return errors
        wanted = s.get('type')
        if wanted is not None and not any(types[t](v) for t in ([wanted] if isinstance(wanted, str) else wanted)):
            fail('type')
            return errors
        if type(v) is float and not math.isfinite(v): fail('finite_number')
        if 'enum' in s and not any(equal(v, x) for x in s['enum']): fail('enum')
        if 'const' in s and not equal(v, s['const']): fail('const')
        for op in ('allOf', 'anyOf', 'oneOf'):
            if op in s:
                passed = sum(not validate(v, branch, path, depth + 1) for branch in s[op])
                if (op == 'allOf' and passed != len(s[op]) or op == 'anyOf' and not passed or op == 'oneOf' and passed != 1): fail(op)
        if 'not' in s and not validate(v, s['not'], path, depth + 1): fail('not')
        if isinstance(v, dict):
            for key in s.get('required', []):
                if key not in v: errors.append({'path': path, 'keyword': 'required', 'missing': key})
            for key, item in v.items():
                child = s.get('properties', {}).get(key, s.get('additionalProperties', True))
                errors.extend(validate(item, child, path + '/' + str(key).replace('~', '~0').replace('/', '~1'), depth + 1))
        if isinstance(v, list):
            if s.get('uniqueItems') and any(equal(v[i], v[j]) for i in range(len(v)) for j in range(i)):
                fail('uniqueItems')
            for i, item in enumerate(v):
                errors.extend(validate(item, s.get('items', True), path + '/' + str(i), depth + 1))
        for low, high, applies in (('minLength', 'maxLength', isinstance(v, str)),
                                  ('minItems', 'maxItems', isinstance(v, list)),
                                  ('minProperties', 'maxProperties', isinstance(v, dict))):
            if applies:
                if low in s and len(v) < s[low]: fail(low)
                if high in s and len(v) > s[high]: fail(high)
        if type(v) in (int, float):
            for k, bad in (('minimum', lambda x: v < x), ('maximum', lambda x: v > x),
                           ('exclusiveMinimum', lambda x: v <= x), ('exclusiveMaximum', lambda x: v >= x)):
                if k in s and bad(s[k]): fail(k)
        return errors

    check(schema)
    try:
        json.dumps(value, allow_nan=False)
    except (ValueError, TypeError, RecursionError):
        return {'valid': False, 'contract_errors': contract_errors,
                'errors': [{'path': '$', 'keyword': 'json_value'}],
                'validator': 'station_bounded_contract/v1', 'required_missing': []}
    errors = [] if contract_errors else validate(value, schema)
    return {'valid': not contract_errors and not errors,
            'contract_errors': contract_errors, 'errors': errors,
            'validator': 'station_bounded_contract/v1',
            'required_missing': [e['missing'] for e in errors if e.get('keyword') == 'required' and e['path'] == '$']}

