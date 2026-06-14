"""
AAC (Augmentative and Alternative Communication) Dictionary
===========================================================

A curated vocabulary of ~1000 common words/phrases used in AAC devices,
organized by clinical categories relevant to stroke/aphasia patients.

Each label is a short noun phrase (1-4 words) optimized for SigLIP2
zero-shot image classification against patient-drawn sketches.

Categories follow standard AAC vocabulary frameworks (core + fringe)
used in clinical speech-language pathology for adults with aphasia.
"""

# ---------------------------------------------------------------------------
# Category dictionaries — each maps a category name to its labels.
# Order within categories roughly follows clinical usage frequency.
# ---------------------------------------------------------------------------

AAC_CATEGORIES = {

    # ── Basic Needs & Requests ──────────────────────────────────────────
    "basic_needs": [
        "water", "glass of water", "water bottle", "water glass",
        "food", "meal", "snack", "hungry",
        "drink", "juice", "milk", "tea", "coffee",
        "bathroom", "toilet", "restroom", "urinal",
        "sleep", "nap", "rest", "tired",
        "bed", "pillow", "blanket", "sheet",
        "help", "assistance", "emergency", "call button",
        "pain", "hurt", "ache", "discomfort",
        "cold", "hot", "warm", "cool",
        "yes", "no", "stop", "go",
        "more", "less", "enough", "please",
        "thank you", "sorry", "hello", "goodbye",
    ],

    # ── Medical / Health ────────────────────────────────────────────────
    "medical": [
        "medicine", "medication", "pill", "pill bottle",
        "tablet", "capsule", "prescription", "dose",
        "syringe", "injection", "needle", "insulin",
        "thermometer", "temperature", "fever", "chills",
        "bandage", "gauze", "tape", "wound",
        "blood pressure", "blood pressure cuff", "pulse",
        "oxygen", "oxygen mask", "breathing", "inhaler",
        "nebulizer", "CPAP machine", "ventilator",
        "wheelchair", "walker", "crutch", "cane",
        "cast", "brace", "splint", "sling",
        "eye drops", "ear drops", "cream", "ointment",
        "vitamin", "supplement", "antibiotic",
        "doctor", "appointment", "checkup", "surgery",
        "x-ray", "scan", "test", "lab work",
        "hospital", "clinic", "pharmacy", "ambulance",
        "heart monitor", "pulse oximeter",
        "allergy", "rash", "itch", "swelling",
        "cough", "sneeze", "runny nose", "sore throat",
        "headache", "migraine", "dizziness", "nausea",
        "physical therapy", "exercise", "stretching", "rehabilitation",
        "blood sugar", "glucose meter", "diabetes",
        "hearing aid", "dentures", "prosthetic",
    ],

    # ── Body Parts / Pain Location ──────────────────────────────────────
    "body": [
        "head", "forehead", "brain", "skull",
        "eye", "eyes", "ear", "ears",
        "nose", "mouth", "lips", "tongue",
        "tooth", "teeth", "jaw", "chin",
        "neck", "throat", "shoulder", "shoulders",
        "arm", "arms", "elbow", "wrist",
        "hand", "hands", "finger", "fingers", "thumb",
        "chest", "heart", "lungs", "ribs",
        "stomach", "belly", "abdomen", "side",
        "back", "spine", "lower back", "upper back",
        "hip", "hips", "leg", "legs",
        "knee", "knees", "ankle", "ankles",
        "foot", "feet", "toe", "toes",
        "skin", "muscle", "bone", "joint",
    ],

    # ── People / Social ─────────────────────────────────────────────────
    "people": [
        "person", "people", "man", "woman",
        "boy", "girl", "child", "baby",
        "stick figure", "human", "face", "head",
        "family", "mother", "father", "parent",
        "son", "daughter", "brother", "sister",
        "husband", "wife", "spouse", "partner",
        "grandparent", "grandmother", "grandfather",
        "grandchild", "grandson", "granddaughter",
        "uncle", "aunt", "cousin", "nephew", "niece",
        "friend", "visitor", "neighbor", "companion",
        "doctor", "nurse", "caretaker", "therapist",
        "pharmacist", "surgeon", "dentist", "specialist",
        "priest", "pastor", "chaplain",
        "social worker", "aide", "volunteer",
    ],

    # ── Emotions / Feelings ─────────────────────────────────────────────
    "emotions": [
        "happy", "happy face", "smile", "smiley face",
        "sad", "sad face", "crying", "tears",
        "angry", "angry face", "frustrated", "mad",
        "scared", "afraid", "worried", "anxious",
        "surprised", "shocked", "confused", "puzzled",
        "tired", "exhausted", "sleepy", "bored",
        "lonely", "alone", "missing someone",
        "love", "heart", "hug", "kiss",
        "calm", "peaceful", "relaxed", "comfortable",
        "sick", "unwell", "nauseous", "dizzy",
    ],

    # ── Food & Drink ────────────────────────────────────────────────────
    "food_drink": [
        "cup", "mug", "glass", "bottle",
        "plate", "bowl", "tray", "dish",
        "spoon", "fork", "knife", "chopsticks",
        "straw", "napkin", "bib",
        "bread", "toast", "sandwich", "wrap",
        "rice", "pasta", "noodles", "cereal",
        "soup", "broth", "stew", "porridge", "oatmeal",
        "egg", "eggs", "bacon", "sausage",
        "chicken", "meat", "fish", "beef", "pork",
        "salad", "vegetables", "broccoli", "carrot",
        "potato", "corn", "beans", "peas",
        "apple", "banana", "orange", "grapes",
        "strawberry", "watermelon", "pear", "peach",
        "cake", "cookie", "pie", "ice cream",
        "chocolate", "candy", "pudding", "jelly",
        "cheese", "butter", "yogurt", "cream",
        "honey", "jam", "peanut butter", "syrup",
        "salt", "pepper", "sugar", "sauce", "ketchup",
        "pizza", "hamburger", "french fries", "hot dog",
        "chips", "crackers", "popcorn", "nuts",
    ],

    # ── Clothing & Accessories ──────────────────────────────────────────
    "clothing": [
        "shirt", "t-shirt", "blouse", "sweater",
        "jacket", "coat", "hoodie", "vest",
        "pants", "trousers", "jeans", "shorts",
        "skirt", "dress", "gown", "hospital gown",
        "underwear", "socks", "stockings",
        "shoes", "slippers", "boots", "sandals",
        "hat", "cap", "beanie", "scarf",
        "gloves", "mittens", "belt", "tie",
        "glasses", "sunglasses", "watch", "jewelry",
        "ring", "necklace", "bracelet",
    ],

    # ── Household Objects ───────────────────────────────────────────────
    "household": [
        "bed", "couch", "sofa", "chair",
        "recliner", "rocking chair", "stool",
        "table", "desk", "nightstand", "dresser",
        "shelf", "cabinet", "drawer", "closet",
        "door", "doorknob", "handle", "lock",
        "window", "curtain", "blinds", "shade",
        "lamp", "light", "light switch", "flashlight",
        "clock", "alarm clock", "timer", "watch",
        "fan", "air conditioner", "heater", "thermostat",
        "mirror", "picture frame", "photograph", "painting",
        "rug", "carpet", "mat", "floor",
        "wall", "ceiling", "stairs", "elevator",
        "trash can", "garbage", "recycling bin",
        "vacuum", "broom", "mop", "bucket",
        "basket", "box", "bag", "container",
        "hanger", "hook", "shelf", "rack",
    ],

    # ── Hygiene / Personal Care ─────────────────────────────────────────
    "hygiene": [
        "toothbrush", "toothpaste", "mouthwash", "floss",
        "soap", "hand soap", "body wash", "shampoo",
        "conditioner", "lotion", "moisturizer",
        "towel", "washcloth", "bathrobe",
        "comb", "brush", "hair dryer",
        "razor", "shaving cream", "deodorant",
        "tissue", "toilet paper", "wet wipe",
        "shower", "bath", "bathtub", "sink", "faucet",
        "diaper", "pad", "catheter",
        "hand sanitizer", "disinfectant",
    ],

    # ── Activities / Actions ────────────────────────────────────────────
    "activities": [
        "walking", "standing", "sitting", "lying down",
        "running", "climbing", "bending", "reaching",
        "eating", "drinking", "chewing", "swallowing",
        "reading", "writing", "drawing", "painting",
        "watching TV", "listening to music", "singing",
        "talking", "whispering", "yelling", "calling",
        "sleeping", "waking up", "resting", "napping",
        "praying", "meditating", "thinking", "remembering",
        "playing", "exercising", "stretching", "lifting",
        "cooking", "cleaning", "washing", "drying",
        "dressing", "undressing", "bathing", "grooming",
        "typing", "scrolling", "pressing button",
        "opening", "closing", "pushing", "pulling",
        "cutting", "tearing", "folding", "wrapping",
    ],

    # ── Nature / Weather ────────────────────────────────────────────────
    "nature": [
        "sun", "sunshine", "sunlight", "sunrise", "sunset",
        "moon", "moonlight", "stars", "night sky",
        "cloud", "clouds", "sky", "rainbow",
        "rain", "raindrop", "storm", "thunder", "lightning",
        "snow", "snowflake", "ice", "frost",
        "wind", "breeze", "tornado",
        "tree", "leaf", "leaves", "branch",
        "flower", "rose", "daisy", "sunflower",
        "grass", "garden", "plant", "seed",
        "mountain", "hill", "river", "lake",
        "ocean", "sea", "beach", "wave",
    ],

    # ── Transportation ──────────────────────────────────────────────────
    "transportation": [
        "car", "automobile", "van", "truck",
        "bus", "taxi", "ride", "drive",
        "bicycle", "bike", "motorcycle", "scooter",
        "airplane", "plane", "helicopter",
        "boat", "ship", "ferry", "canoe",
        "train", "subway", "tram",
        "wheelchair", "stretcher", "gurney",
        "road", "street", "sidewalk", "crosswalk",
        "parking", "garage", "gas station",
    ],

    # ── Places ──────────────────────────────────────────────────────────
    "places": [
        "hospital", "hospital room", "emergency room", "ward",
        "home", "house", "apartment", "room",
        "bedroom", "living room", "kitchen", "dining room",
        "bathroom", "laundry room", "basement", "attic",
        "school", "classroom", "library", "office",
        "store", "shop", "supermarket", "mall",
        "park", "playground", "garden", "yard",
        "church", "temple", "mosque", "chapel",
        "restaurant", "cafe", "bakery", "bar",
        "bank", "post office", "police station", "fire station",
    ],

    # ── Communication / Media ───────────────────────────────────────────
    "communication": [
        "phone", "cellphone", "smartphone", "telephone",
        "computer", "laptop", "tablet", "iPad",
        "TV", "television", "screen", "monitor",
        "remote control", "controller", "keyboard", "mouse",
        "book", "magazine", "newspaper", "letter",
        "pen", "pencil", "marker", "crayon",
        "paper", "notebook", "card", "envelope",
        "email", "message", "text message",
        "music", "radio", "speaker", "headphones",
        "bell", "alarm", "buzzer", "doorbell",
        "camera", "video", "microphone",
    ],

    # ── Numbers / Time ──────────────────────────────────────────────────
    "time": [
        "clock", "watch", "timer", "stopwatch",
        "calendar", "schedule", "planner",
        "morning", "afternoon", "evening", "night",
        "today", "tomorrow", "yesterday",
        "hour", "minute", "second",
        "breakfast time", "lunch time", "dinner time",
        "bedtime", "wake up time", "appointment time",
    ],

    # ── Colors / Shapes ─────────────────────────────────────────────────
    "shapes": [
        "circle", "round", "oval", "sphere",
        "square", "rectangle", "cube", "block",
        "triangle", "diamond", "pentagon", "hexagon",
        "star", "star shape", "crescent",
        "heart", "heart shape",
        "arrow", "arrow up", "arrow down", "arrow left", "arrow right",
        "cross", "plus sign", "minus sign",
        "line", "zigzag", "spiral", "wave shape",
    ],

    # ── Kitchen / Cooking ───────────────────────────────────────────────
    "kitchen": [
        "stove", "burner", "oven", "toaster",
        "microwave", "blender", "mixer",
        "refrigerator", "fridge", "freezer",
        "sink", "faucet", "dishwasher",
        "pot", "pan", "skillet", "wok",
        "kettle", "teapot", "coffee maker", "coffee pot",
        "cutting board", "rolling pin", "whisk",
        "can opener", "bottle opener", "corkscrew",
        "colander", "strainer", "grater",
        "spatula", "ladle", "tongs", "peeler",
    ],

    # ── Room Environment ────────────────────────────────────────────────
    "room_environment": [
        "curtain", "drape", "window shade", "venetian blind",
        "remote control", "call button", "nurse call",
        "thermostat", "temperature control",
        "light switch", "dimmer", "outlet", "plug",
        "bedside table", "overbed table", "tray table",
        "bed rail", "bed railing", "guardrail",
        "IV pole", "IV stand", "monitor stand",
        "whiteboard", "bulletin board", "sign",
        "air vent", "ceiling fan", "space heater",
        "smoke detector", "fire alarm", "sprinkler",
        "handrail", "grab bar", "safety rail",
        "ramp", "threshold", "step",
    ],

    # ── Animals ─────────────────────────────────────────────────────────
    "animals": [
        "cat", "kitten", "dog", "puppy",
        "bird", "parrot", "canary", "robin",
        "fish", "goldfish", "aquarium",
        "rabbit", "bunny", "hamster", "guinea pig",
        "horse", "pony", "donkey",
        "cow", "pig", "sheep", "goat", "chicken",
        "duck", "goose", "turkey",
        "butterfly", "bee", "ladybug", "ant",
        "turtle", "frog", "snake", "lizard",
        "mouse", "rat", "squirrel",
    ],

    # ── Tools / Equipment ───────────────────────────────────────────────
    "tools": [
        "scissors", "tape", "glue", "stapler",
        "key", "keys", "keychain", "lock",
        "hammer", "screwdriver", "wrench", "pliers",
        "nail", "screw", "bolt", "nut",
        "box", "package", "crate", "bin",
        "rope", "string", "wire", "chain",
        "battery", "charger", "adapter", "cable",
        "flashlight", "lantern", "candle", "match",
    ],

    # ── Hospital-Specific ───────────────────────────────────────────────
    "hospital": [
        "IV drip", "IV bag", "IV line", "IV tube",
        "blood pressure monitor", "blood pressure cuff",
        "oxygen tank", "oxygen tube", "nasal cannula",
        "hospital bed", "hospital gown", "hospital bracelet",
        "stethoscope", "otoscope", "ophthalmoscope",
        "chart", "medical chart", "clipboard",
        "vital signs", "heart rate", "blood pressure reading",
        "bedpan", "urinal", "commode",
        "suction machine", "feeding tube", "catheter bag",
        "wound dressing", "surgical tape", "medical gloves",
        "face mask", "surgical mask", "N95 mask",
        "hand sanitizer", "disinfectant spray",
        "wheelchair ramp", "hospital elevator",
        "waiting room", "reception", "nurses station",
        "operating room", "recovery room", "ICU",
        "lab", "radiology", "MRI machine", "CT scanner",
        "defibrillator", "AED", "crash cart",
        "patient ID band", "medical alert bracelet",
        "prescription pad", "medication tray",
        "sharps container", "biohazard bin",
        "patient monitor", "EKG machine", "ventilator",
    ],

    # ── Abstract / Symbols ──────────────────────────────────────────────
    "symbols": [
        "question mark", "exclamation mark", "exclamation point",
        "checkmark", "check mark", "tick",
        "X mark", "cross mark", "wrong",
        "plus sign", "addition", "minus sign", "subtraction",
        "equal sign", "percent sign", "dollar sign",
        "arrow pointing up", "arrow pointing down",
        "arrow pointing left", "arrow pointing right",
        "thumbs up", "thumbs down", "pointing finger",
        "peace sign", "OK sign", "wave",
        "number one", "number two", "number three",
        "smiley face", "frown face", "neutral face",
    ],

    # ── Miscellaneous ───────────────────────────────────────────────────
    "miscellaneous": [
        "money", "cash", "coin", "wallet", "purse",
        "credit card", "debit card", "ID card",
        "bag", "backpack", "suitcase", "luggage",
        "umbrella", "raincoat", "poncho",
        "camera", "photograph", "picture", "selfie",
        "gift", "present", "wrapping paper", "bow",
        "flag", "banner", "sign", "poster",
        "map", "compass", "directions",
        "toy", "doll", "teddy bear", "ball",
        "game", "puzzle", "card game", "board game",
        "newspaper", "magazine", "comic book",
        "cigarette", "lighter", "ashtray",
        "wine", "beer", "cocktail", "alcohol",
        "ice", "ice pack", "hot pack", "heating pad",
        "oxygen", "fresh air", "ventilation",
    ],
}

# ---------------------------------------------------------------------------
# Flattened, deduplicated label list for SigLIP2 consumption
# ---------------------------------------------------------------------------

def _build_label_list() -> list:
    """Flatten all categories into a single deduplicated list, preserving order."""
    seen = set()
    labels = []
    for _category, items in AAC_CATEGORIES.items():
        for item in items:
            normalized = item.strip().lower()
            if normalized not in seen:
                seen.add(normalized)
                labels.append(item.strip())
    return labels


AAC_LABELS: list = _build_label_list()


# Quick stats when run directly
if __name__ == "__main__":
    print(f"Total unique AAC labels: {len(AAC_LABELS)}")
    print(f"Categories: {len(AAC_CATEGORIES)}")
    for cat, items in AAC_CATEGORIES.items():
        print(f"  {cat}: {len(items)} labels")
    print(f"\nFirst 20 labels: {AAC_LABELS[:20]}")
    print(f"Last 20 labels:  {AAC_LABELS[-20:]}")
