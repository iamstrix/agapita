import unittest

from aac_dictionary import AAC_CATEGORIES, AAC_LABELS


EXPECTED_CATEGORY_COUNTS = {
    "food_drink": 125,
    "household_objects": 115,
    "body_parts": 70,
    "places_rooms": 65,
    "kitchen_objects": 65,
    "clothing": 60,
    "medical_supplies": 45,
    "people_roles": 55,
    "transportation": 50,
    "communication_objects": 55,
    "hygiene_personal_care": 50,
    "personal_belongings": 45,
    "accessibility_mobility": 35,
    "recreation_interests": 45,
    "animals": 35,
    "nature_weather": 30,
    "tools_hardware": 35,
    "hospital_room_objects": 20,
}

FORBIDDEN_NEAR_SYNONYMS = {
    "manual wheelchair",
    "power wheelchair",
    "rolling walker",
    "quad cane",
    "white cane",
    "forearm crutch",
    "cellphone",
    "smartphone",
    "couch",
    "saucepan",
    "skillet",
    "capsule",
    "tablet",
    "medical thermometer",
    "hospital pillow",
    "hospital blanket",
    "visitor chair",
    "medical clipboard",
    "keys",
    "mug",
    "garden shovel",
    "medicine tray",
}

REQUIRED_CANONICAL_LABELS = {
    "wheelchair",
    "walker",
    "cane",
    "crutch",
    "phone",
    "sofa",
    "pot",
    "pan",
    "pill",
    "thermometer",
    "pillow",
    "blanket",
    "chair",
    "clipboard",
    "key",
    "teapot",
    "hula hoop",
    "emesis basin",
}


class AACDictionaryTests(unittest.TestCase):
    def test_has_expected_category_counts_and_total(self):
        self.assertEqual(
            {name: len(labels) for name, labels in AAC_CATEGORIES.items()},
            EXPECTED_CATEGORY_COUNTS,
        )
        self.assertEqual(len(AAC_LABELS), 1000)

    def test_labels_are_clean_and_unique(self):
        normalized = [label.strip().lower() for label in AAC_LABELS]

        self.assertEqual(len(normalized), len(set(normalized)))
        self.assertTrue(all(label and label == label.strip() for label in AAC_LABELS))
        self.assertTrue(
            all(len(label.replace("-", " ").split()) <= 3 for label in AAC_LABELS)
        )

    def test_uses_one_canonical_label_for_known_synonym_groups(self):
        labels = {label.lower() for label in AAC_LABELS}

        self.assertTrue(labels.isdisjoint(FORBIDDEN_NEAR_SYNONYMS))
        self.assertTrue(REQUIRED_CANONICAL_LABELS <= labels)


if __name__ == "__main__":
    unittest.main()
