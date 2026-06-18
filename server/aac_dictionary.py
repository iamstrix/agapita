"""
AAC (Augmentative and Alternative Communication) drawable vocabulary.

The dictionary contains exactly 1000 concrete, familiar concepts selected for
adult stroke and aphasia patients who communicate by drawing.  Labels favor
daily needs and recognizable physical subjects.  Synonym variants, abstract
states, specialist medical jargon, and concepts that cannot be sketched
clearly are intentionally excluded.

The public ``AAC_CATEGORIES`` and ``AAC_LABELS`` interfaces are consumed by
the SigLIP2 zero-shot sketch classifier in ``main.py``.
"""


def _labels(value: str) -> list[str]:
    """Split a compact pipe-delimited category definition into labels."""
    return [label.strip() for label in value.split("|") if label.strip()]


AAC_CATEGORIES: dict[str, list[str]] = {
    "food_drink": _labels(
        "water|milk|coffee|tea|juice|soda|lemonade|smoothie|water bottle|"
        "drinking glass|juice box|soda can|bread|toast|bagel|croissant|bun|"
        "tortilla|pita|cracker|rice|noodles|pasta|cereal|oatmeal|soup|stew|"
        "salad|sandwich|hamburger|hot dog|pizza|taco|burrito|dumpling|"
        "egg|omelet|pancake|waffle|bacon|sausage|chicken|turkey|beef|steak|"
        "pork|ham|meatball|fish|shrimp|crab|lobster|tuna|salmon|"
        "apple|banana|orange|lemon|lime|grape|strawberry|blueberry|raspberry|"
        "watermelon|melon|pineapple|mango|peach|pear|plum|cherry|coconut|"
        "avocado|tomato|potato|carrot|corn|broccoli|cabbage|lettuce|onion|"
        "garlic|cucumber|pepper|mushroom|beans|peas|pumpkin|sweet potato|"
        "cake|cupcake|cookie|pie|donut|muffin|brownie|chocolate|candy|lollipop|"
        "ice cream|pudding|yogurt|cheese|butter|jam|honey|peanut butter|"
        "ketchup|mustard|mayonnaise|salt|sugar|flour|nuts|popcorn|potato chips|"
        "meatloaf|spinach|radish|zucchini|cauliflower|asparagus|beet|celery|"
        "eggplant"
    ),
    "household_objects": _labels(
        "bed|mattress|pillow|blanket|headboard|nightstand|dresser|closet|"
        "hanger|laundry basket|iron|ironing board|sofa|armchair|rocking chair|"
        "stool|bench|ottoman|table|desk|chair|bookshelf|cabinet|"
        "drawer|shelf|coat rack|shoe rack|"
        "door|doorknob|door lock|window|curtain|blinds|doorbell|"
        "key|padlock|"
        "lamp|lampshade|ceiling light|light bulb|light switch|flashlight|"
        "candle|matchbox|"
        "wall clock|alarm clock|calendar|mirror|picture frame|vase|flowerpot|"
        "rug|doormat|"
        "television|remote control|radio|speaker|fan|ceiling fan|heater|"
        "air conditioner|thermostat|humidifier|"
        "vacuum cleaner|broom|dustpan|mop|bucket|sponge|scrub brush|duster|"
        "trash can|recycling bin|garbage bag|clothespin|clothesline|"
        "washing machine|clothes dryer|laundry detergent|"
        "box|basket|jar|bottle|can|"
        "paper towel|napkin|tissue box|toilet paper|"
        "extension cord|power strip|electrical outlet|plug|battery|"
        "smoke detector|fire extinguisher|first aid kit|"
        "stairs|handrail|elevator|doorway|hallway|"
        "fence|gate|mailbox|garden hose|watering can|"
        "sewing machine|thread spool|safety pin|button|zipper|"
        "wall hook|towel rack|shower curtain|bath mat"
    ),
    "body_parts": _labels(
        "head|hair|face|forehead|temple|eye|eyebrow|eyelash|ear|nose|nostril|"
        "cheek|mouth|lip|tongue|tooth|gum|jaw|chin|neck|throat|shoulder|"
        "chest|breast|back|shoulder blade|waist|belly|navel|hip|buttock|"
        "arm|upper arm|elbow|forearm|wrist|hand|palm|finger|thumb|fingernail|"
        "leg|thigh|knee|shin|calf|ankle|heel|foot|sole|toe|toenail|"
        "skin|bone|muscle|joint|spine|rib|skull|brain|heart|lung|stomach|"
        "liver|kidney|intestine|bladder|pelvis|knuckle|armpit"
    ),
    "places_rooms": _labels(
        "house|apartment|bedroom|bathroom|kitchen|living room|dining room|"
        "laundry room|garage|basement|attic|balcony|porch|patio|backyard|"
        "garden|hospital|clinic|pharmacy|doctor office|dentist office|"
        "therapy room|waiting room|nursing home|ambulance station|"
        "grocery store|bakery|restaurant|cafe|market|shopping mall|bank|"
        "post office|library|school|classroom|office|workshop|factory|"
        "church|chapel|mosque|synagogue|cemetery|"
        "park|playground|beach|farm|zoo|museum|movie theater|stadium|gym|"
        "swimming pool|hotel|airport|train station|bus stop|gas station|"
        "police station|fire station|barber shop|hair salon|flower shop|"
        "parking lot"
    ),
    "kitchen_objects": _labels(
        "refrigerator|freezer|stove|oven|microwave|toaster|blender|mixer|"
        "coffee maker|kettle|rice cooker|slow cooker|dishwasher|kitchen sink|"
        "faucet|pot|pan|wok|baking tray|casserole dish|cutting board|colander|"
        "grater|rolling pin|measuring cup|measuring spoon|plate|bowl|cup|teapot|"
        "wine glass|"
        "pitcher|thermos|lunch box|food container|"
        "spoon|fork|knife|chopsticks|straw|ladle|spatula|"
        "whisk|tongs|peeler|cleaver|can opener|bottle opener|corkscrew|"
        "kitchen timer|ice tray|oven mitt|apron|dish towel|pressure cooker|"
        "food processor|juicer|waffle maker|kitchen scale|mortar|pestle|"
        "garlic press|pizza cutter|vegetable brush|bread box"
    ),
    "clothing": _labels(
        "shirt|t-shirt|blouse|sweater|cardigan|hoodie|jacket|coat|raincoat|"
        "vest|suit|uniform|hospital gown|bathrobe|dress|skirt|pants|"
        "shorts|pajamas|underwear|bra|diaper|sock|"
        "shoe|slipper|sandal|boot|sneaker|high heel|"
        "hat|beanie|sun hat|helmet|scarf|glove|mitten|belt|tie|bow tie|"
        "glasses|sunglasses|watch|ring|necklace|bracelet|earring|wallet|purse|"
        "backpack|suitcase|overalls|swimsuit|poncho|lab coat|suspenders|"
        "eye patch|veil|sari|clogs|crown"
    ),
    "medical_supplies": _labels(
        "pill|pill bottle|pill organizer|syringe|needle|bandage|gauze|cotton ball|"
        "thermometer|stethoscope|blood pressure cuff|glucose meter|test strip|"
        "inhaler|oxygen mask|oxygen tank|nasal cannula|nebulizer|"
        "hearing aid|dentures|eyeglass case|eye drops|ear drops|ointment tube|"
        "ice pack|heating pad|hot water bottle|"
        "surgical mask|hand sanitizer|disinfectant wipe|"
        "walking boot|arm sling|neck brace|knee brace|ankle brace|wrist brace|"
        "plaster cast|elastic bandage|tongue depressor|prescription paper|"
        "medicine cup|face shield|blood bag|x-ray film|medicine dropper"
    ),
    "people_roles": _labels(
        "person|man|woman|boy|girl|baby|mother|father|son|daughter|brother|"
        "sister|husband|wife|grandmother|grandfather|grandson|granddaughter|"
        "aunt|uncle|cousin|friend|neighbor|visitor|caregiver|"
        "doctor|nurse|therapist|pharmacist|dentist|paramedic|surgeon|patient|"
        "teacher|student|police officer|firefighter|chef|waiter|cashier|"
        "driver|farmer|mechanic|mail carrier|priest|hairdresser|"
        "construction worker|office worker|security guard|baker|librarian|"
        "plumber|electrician|gardener|musician"
    ),
    "transportation": _labels(
        "car|taxi|van|pickup truck|truck|ambulance|fire truck|"
        "police car|bus|school bus|motorcycle|scooter|bicycle|tricycle|"
        "train|tram|airplane|helicopter|boat|sailboat|ship|ferry|canoe|tractor|"
        "golf cart|shopping cart|"
        "car seat|seat belt|steering wheel|car key|traffic light|stop sign|"
        "road sign|crosswalk|road|sidewalk|bridge|tunnel|railroad track|"
        "parking space|gas pump|train platform|airport runway|boat dock|"
        "life jacket|bulldozer|excavator|forklift|cable car|skateboard"
    ),
    "communication_objects": _labels(
        "phone|tablet computer|laptop|desktop computer|"
        "computer monitor|keyboard|computer mouse|printer|charger|headphones|"
        "microphone|camera|book|magazine|newspaper|photo album|photograph|"
        "postcard|greeting card|letter|envelope|stamp|notebook|clipboard|"
        "paper|pen|pencil|marker|crayon|chalk|eraser|"
        "pencil sharpener|ruler|whiteboard|bulletin board|name tag|"
        "picture card|communication board|alphabet board|call bell|pager|"
        "fax machine|hearing amplifier|walkie-talkie|megaphone|typewriter|"
        "projector|webcam|router|USB drive|compact disc|cassette tape|"
        "record player|map|globe"
    ),
    "hygiene_personal_care": _labels(
        "toothbrush|toothpaste|dental floss|mouthwash|soap|soap dispenser|"
        "body wash|shampoo|conditioner|lotion|deodorant|perfume|"
        "towel|washcloth|bath sponge|comb|hairbrush|hair dryer|hair clip|"
        "hair tie|razor|shaving cream|nail clipper|nail file|cotton swab|"
        "tissue|wet wipe|toilet brush|plunger|bedpan|urinal|commode|"
        "shower|bathtub|toilet|bidet|sanitary pad|shower cap|tongue scraper|"
        "toilet seat|toilet tank|showerhead|bath brush|loofah|nail polish|"
        "lipstick|makeup brush|powder compact|soap dish|toothbrush holder"
    ),
    "personal_belongings": _labels(
        "ID card|cash|coin|keychain|money clip|address book|"
        "shopping bag|tote bag|duffel bag|luggage tag|umbrella|travel mug|"
        "lunch bag|sleep mask|earplug|hand fan|rosary|prayer book|"
        "cross necklace|teddy bear|houseplant|flower bouquet|sunglasses case|"
        "coin purse|document folder|pill pouch|emergency whistle|passport|"
        "briefcase|fanny pack|key fob|neck pillow|piggy bank|checkbook|bookmark|"
        "handkerchief|locket|brooch|cufflink|medal|pocketknife|compass|lanyard|"
        "badge|wristband"
    ),
    "accessibility_mobility": _labels(
        "wheelchair|walker|cane|crutch|mobility scooter|"
        "transfer board|transfer belt|patient lift|bed trapeze|"
        "shower chair|raised toilet seat|grab bar|bed rail|ramp|stair lift|"
        "elevator button|"
        "prosthetic leg|prosthetic arm|orthopedic shoe|leg splint|hand splint|"
        "reacher tool|dressing stick|button hook|shoehorn|"
        "adaptive spoon|adaptive fork|plate guard|non-slip mat|magnifying glass|"
        "sock aid|wheelchair tray|standing frame|parallel bars|bed ladder"
    ),
    "recreation_interests": _labels(
        "playing card|chessboard|chess piece|checkers board|"
        "domino|dice|jigsaw puzzle|board game|bingo card|"
        "soccer ball|basketball|baseball|baseball bat|football|tennis racket|"
        "tennis ball|golf club|golf ball|bowling ball|fishing rod|"
        "paintbrush|paint palette|canvas|coloring book|sketchbook|"
        "guitar|piano|violin|drum|flute|harmonica|"
        "hula hoop|knitting needle|yarn ball|sewing kit|"
        "music player|binoculars|camera tripod|picnic basket|kite|balloon|"
        "jump rope|dartboard|saxophone|telescope"
    ),
    "animals": _labels(
        "dog|cat|bird|parrot|fox|duck|goose|eagle|"
        "cow|pig|horse|donkey|sheep|goat|rabbit|mouse|squirrel|deer|"
        "shark|dolphin|whale|turtle|frog|snake|lizard|elephant|giraffe|lion|"
        "octopus|"
        "butterfly|bee|ant|spider|ladybug|dragonfly"
    ),
    "nature_weather": _labels(
        "sun|moon|star|cloud|rain|raindrop|rainbow|snow|snowflake|ice|"
        "lightning|tornado|tree|branch|leaf|flower|rose|sunflower|grass|"
        "bush|seed|acorn|pinecone|rock|mountain|hill|river|lake|ocean|wave"
    ),
    "tools_hardware": _labels(
        "hammer|screwdriver|wrench|pliers|hand saw|drill|tape measure|level|"
        "paint roller|paint can|toolbox|nail|screw|bolt|nut|washer|hook|"
        "chain|rope|wire|tape|glue bottle|scissors|stapler|paper clip|pushpin|"
        "ladder|safety goggles|shovel|axe|rake|hoe|crowbar|clamp|chisel"
    ),
    "hospital_room_objects": _labels(
        "hospital bed|overbed table|call button|privacy curtain|"
        "IV bag|IV pole|IV tube|heart monitor|pulse oximeter|feeding tube|"
        "catheter bag|hospital bracelet|patient chart|wheelchair cushion|"
        "stretcher|meal tray|emesis basin|specimen cup|suction tube|exam table"
    ),
}


def _build_label_list() -> list[str]:
    """Flatten categories into one case-insensitively unique ordered list."""
    seen: set[str] = set()
    labels: list[str] = []
    for items in AAC_CATEGORIES.values():
        for item in items:
            normalized = item.strip().lower()
            if normalized not in seen:
                seen.add(normalized)
                labels.append(item.strip())
    return labels


AAC_LABELS: list[str] = _build_label_list()


if __name__ == "__main__":
    print(f"Total unique AAC labels: {len(AAC_LABELS)}")
    print(f"Categories: {len(AAC_CATEGORIES)}")
    for category, items in AAC_CATEGORIES.items():
        print(f"  {category}: {len(items)} labels")
