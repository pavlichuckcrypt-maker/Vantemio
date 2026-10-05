import copy
import json
import tempfile
import unittest
from pathlib import Path
from model_catalog import load_catalog, CATALOG_SCHEMA
from response_contract import validate_response_contract as validate

class AuditContracts(unittest.TestCase):
    def test_catalog_is_consistent(self):
        catalog = load_catalog()
        self.assertEqual(len(catalog["models"]), 9)
        self.assertEqual(catalog["authority"], "station")

    def test_runtime_configuration_cannot_be_added_to_catalog(self):
        catalog = load_catalog()
        catalog["models"][0]["runtime_configuration"] = {"synthetic": True}
        self.assertFalse(validate(catalog, CATALOG_SCHEMA)["valid"])

    def test_registered_status_cannot_claim_ready(self):
        catalog = load_catalog()
        catalog["models"][0]["evidence_status"] = "production_ready"
        self.assertFalse(validate(catalog, CATALOG_SCHEMA)["valid"])

    def test_duplicate_model_identity_is_rejected(self):
        catalog = load_catalog()
        catalog["models"].append(copy.deepcopy(catalog["models"][0]))
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "synthetic.json"
            path.write_text(json.dumps(catalog))
            with self.assertRaises(ValueError):
                load_catalog(path)

    def test_missing_result_field_is_reported(self):
        result = validate({}, {"type": "object", "required": ["decision"]})
        self.assertFalse(result["valid"])
        self.assertEqual(result["required_missing"], ["decision"])

    def test_boolean_cannot_impersonate_numeric_enum(self):
        self.assertFalse(validate(True, {"enum": [1]})["valid"])
        self.assertFalse(validate([True], {"const": [1]})["valid"])

    def test_nonfinite_numbers_are_not_json_results(self):
        for value in (float("nan"), float("inf"), {"v": float("inf")}):
            self.assertFalse(validate(value, True)["valid"])

    def test_remote_schema_reference_is_rejected(self):
        result = validate({}, {"$ref": "https://example.invalid/schema"})
        self.assertFalse(result["valid"])
        self.assertTrue(result["contract_errors"])

    def test_malformed_unused_schema_is_rejected(self):
        result = validate({}, {"type": "object", "properties": {"unused": {"maxLength": -1}}})
        self.assertFalse(result["valid"])
        self.assertTrue(result["contract_errors"])

    def test_limits_and_unknown_fields_are_enforced(self):
        schema = {"type": "object", "additionalProperties": False,
                  "required": ["items"], "properties": {"items": {"type": "array", "maxItems": 2,
                  "items": {"type": "integer", "minimum": 0, "maximum": 5}}}}
        self.assertTrue(validate({"items": [0, 5]}, schema)["valid"])
        for value in ({"items": [6]}, {"items": [1, 2, 3]}, {"items": [True]}, {"items": [], "extra": 1}):
            self.assertFalse(validate(value, schema)["valid"])

    def test_exclusive_alternatives_are_enforced(self):
        self.assertFalse(validate(1, {"oneOf": [{"type": "number"}, {"type": "integer"}]})["valid"])
        self.assertTrue(validate("text", {"oneOf": [{"type": "string"}, {"type": "integer"}]})["valid"])

    def test_false_schema_rejects_result(self):
        self.assertFalse(validate("synthetic", False)["valid"])

if __name__ == "__main__":
    unittest.main()
