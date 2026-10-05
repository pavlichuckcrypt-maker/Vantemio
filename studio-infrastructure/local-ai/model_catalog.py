"""Public audit facade over a curated model catalog, not a production router.

Copyright 2026 Vantemio / Vitalii Pavlichuk. See NOTICE.md.
"""
from pathlib import Path
import json
from response_contract import validate_response_contract

# Only public description fields are admitted. Operational configuration is absent.
MODEL_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["id", "label", "registered_name", "roles", "execution_scope", "evidence_status"],
    "properties": {
        "id": {"type": "string", "minLength": 1, "maxLength": 128},
        "label": {"type": "string", "minLength": 1, "maxLength": 128},
        "registered_name": {"type": "string", "minLength": 1, "maxLength": 256},
        "roles": {"type": "array", "minItems": 1, "maxItems": 16, "uniqueItems": True,
                  "items": {"type": "string", "minLength": 1, "maxLength": 128}},
        "execution_scope": {"enum": ["station_gpu", "station_assigned_helper", "station_assigned_executor"]},
        "evidence_status": {"enum": ["recorded_local_execution", "configured_route",
                                      "registered_specialist", "registered_historical_execution"]},
    },
}
CATALOG_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["schema", "snapshot_date", "scope", "authority", "models"],
    "properties": {
        "schema": {"const": "vantemio.public.model_catalog/v1"},
        "snapshot_date": {"type": "string", "minLength": 10, "maxLength": 10},
        "scope": {"const": "review_snapshot_not_runtime_configuration"},
        "authority": {"const": "station"},
        "models": {"type": "array", "minItems": 1, "items": MODEL_SCHEMA},
    },
}

def load_catalog(path=None):
    path = Path(path) if path is not None else Path(__file__).with_name("MODEL_CATALOG.json")
    value = json.loads(path.read_text(encoding="utf-8"))
    result = validate_response_contract(value, CATALOG_SCHEMA)
    if not result["valid"]:
        raise ValueError("Public model catalog does not satisfy its contract")
    ids = [model["id"] for model in value["models"]]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate public model identity")
    return value

if __name__ == "__main__":
    catalog = load_catalog()
    print(json.dumps({"schema": catalog["schema"], "authority": catalog["authority"],
                      "models": catalog["models"]}, indent=2))
