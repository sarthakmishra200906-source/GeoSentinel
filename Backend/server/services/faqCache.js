const FAQ_SOURCE = {
  documentId: 'builtin-basic-safety-faq',
  title: 'GeoSentinel General Disaster Safety Reference',
  issuingAuthority: 'National Disaster Management Authority (NDMA) - public guidance reference',
  officialUrl: 'https://ndma.gov.in',
  section: 'General safety',
  page: null,
  scope: 'general',
  caveat: 'General guidance only. Always follow instructions from your local authorities.',
}

const entries = [
  // Greetings & conversational openers: no provider call needed.
  {
    keywords: [
      'hi', 'hi there', 'hi resq', 'hii', 'hiii', 'hiiii', 'hello', 'helloo', 'hey', 'heyy',
      'howdy', 'namaste', 'good morning', 'good evening', 'start',
    ],
    answer:
      'Hi! I’m Resq-AI, your disaster-safety assistant. Ask me about floods, cyclones, earthquakes, landslides, first aid, or emergency preparedness. I share general safety guidance and, where available, answers from approved documents. I cannot issue official warnings or replace emergency services.',
  },

  // Capabilities, scope and limitations.
  {
    keywords: [
      'what can you do', 'what do you know', 'general help', 'how do you work', 'features',
      'who are you', 'how this assistant works', 'ai agent', 'your limitations', 'can you predict',
      'official warning', 'live forecast', 'current situation',
    ],
    answer:
      'I explain step-by-step safety actions for floods, cyclones, heatwaves, earthquakes, landslides and lightning, summarise approved government guidance when an administrator has uploaded it, show verified rescue centres, and help you submit an SOS report. I provide information only: I cannot confirm live conditions, issue evacuation orders, predict a cyclone path, or replace local authorities and emergency responders.',
  },

  // SOS / Help now.
  {
    keywords: [
      'sos', 'help now', 'emergency report', 'send help', 'how to report', 'rescue me', 'trapped',
      'need rescue', 'stuck', 'stranded', 'call for help', 'report emergency',
    ],
    answer:
      'If you or someone nearby needs urgent assistance, tap the red "Help now" button in the menu to send your live location and situation details to the response team. If you are in immediate life-threatening danger, call your local emergency services first, move to higher or safer ground when it is safe, and keep your phone charged.',
  },

  // Rescue centres and shelters.
  {
    keywords: [
      'rescue center', 'rescue centre', 'shelter', 'safe place', 'relief camp', 'where to go',
      'cyclone shelter', 'evacuation centre', 'evacuation center', 'nearest shelter',
    ],
    answer:
      'Verified rescue centres, their current bed or occupancy status and available amenities such as water, medical aid and backup power are shown on the live map and in the Rescue Centers directory. Confirm the shelter is open before travelling, and never cross flooded roads or damaged bridges to reach it.',
  },

  // Go-bag and preparedness.
  {
    keywords: [
      'emergency kit', 'go bag', 'what to pack', 'emergency bag', 'disaster preparedness',
      'how to prepare', 'prepare for disaster', 'essential items', 'kit items',
    ],
    answer:
      'Keep an emergency go-bag ready with drinking water, dry food, essential prescription medicines, a flashlight, a charged power bank, a whistle, and waterproof copies of IDs and medical records. Store it near your exit, review it every few months, and stay tuned to official alerts so you can leave early if advised.',
  },

  // Evacuation.
  {
    keywords: [
      'evacuation', 'evacuate', 'evacuation process', 'leave home', 'when to leave',
      'follow evacuation order', 'evacuation steps', 'should i evacuate',
    ],
    answer:
      'When authorities issue an evacuation advisory, leave early by the designated safe route rather than waiting for conditions to peak. Switch off electricity and gas if it is safe to do so, take medicines and documents, assist children and elderly neighbours, and do not return until officials declare the area safe.',
  },

  // Floods.
  {
    keywords: [
      'flood water', 'floodwater', 'flood', 'flooding', 'floods', 'waterlogging', 'heavy rain',
      'during a flood', 'flood safety steps', 'stuck in flood', 'trapped in flood',
      'what to do in a flood', 'how to stay safe during flooding',
    ],
    answer:
      'Never walk, swim, or drive through moving or murky floodwater: fast-moving water can knock you down and vehicles can be swept away. Move to an upper floor or higher ground, stay clear of submerged electrical poles and downed wires, and boil or chlorinate drinking water after floods.',
  },

  // Cyclones and severe storms.
  {
    keywords: [
      'cyclone', 'cyclones', 'hurricane', 'storm', 'gale', 'landfall', 'coastal warning',
      'before a cyclone', 'cyclone checklist', 'cyclone safety', 'storm preparation',
      'what should i do before a cyclone', 'severe weather',
    ],
    answer:
      'Before a cyclone makes landfall, secure loose outdoor items, reinforce glass windows, charge phones and power banks, and store at least three days of clean drinking water. If you live in a coastal or weak structure, move to a designated cyclone shelter. During the calm “eye” of the storm stay indoors; violent winds usually return shortly after.',
  },

  // Thunderstorms and lightning.
  {
    keywords: [
      'lightning', 'thunderstorm', 'thunder', 'bijli', 'cloudburst', 'thunderstorm shelter',
      'where is safe during a thunderstorm', 'lightning safety rules',
    ],
    answer:
      'When you hear thunder, move immediately into a sturdy enclosed building or a hard-topped vehicle. Never shelter under tall isolated trees, open sheds, or near metal poles. Unplug non-essential appliances, stay away from windows and running water, and wait at least 30 minutes after the last thunderclap before going outside.',
  },

  // Earthquakes.
  {
    keywords: [
      'earthquake', 'earth quake', 'tremor', 'shaking', 'seismic', 'earthquake safety steps',
      'what to do in earthquake', 'during an earthquake',
    ],
    answer:
      'Drop to your hands and knees, cover your head and neck under a sturdy table or against an interior wall away from glass, and hold on until the shaking stops. Do not use elevators or run outside while debris may be falling. Afterwards, move calmly to an open area and be ready for aftershocks.',
  },

  // Heatwaves.
  {
    keywords: [
      'heatwave', 'heat wave', 'extreme heat', 'sunstroke', 'heat stroke', 'dehydration', 'loo',
      'heatwave precautions', 'hot weather',
    ],
    answer:
      'Avoid direct sun and heavy physical work between late morning and late afternoon, wear loose light-coloured cotton clothing, and drink water or ORS regularly even if you do not feel thirsty. Check on elderly family members and children. Seek urgent medical care for confusion, hot dry skin, dizziness or fainting.',
  },

  // Landslides.
  {
    keywords: [
      'landslide', 'mudslide', 'hill collapse', 'rockfall', 'slope', 'landslide warning signs',
      'heavy rain in hills',
    ],
    answer:
      'During intense or prolonged rain in hilly areas, watch for muddy water suddenly appearing in streams, cracking sounds from trees, or tilting poles. Move away from the landslide path toward higher, stable ground at right angles to the flow, and stay clear afterwards because secondary slides often follow.',
  },

  // Electrical hazards.
  {
    keywords: [
      'electric', 'electricity', 'power line', 'downed wire', 'short circuit', 'electrocution',
      'power cut', 'fallen wire', 'electrical safety',
    ],
    answer:
      'Treat every fallen or sagging power line as live and lethal: stay well away and keep others clear. Never touch switches, appliances or breaker boxes while standing in wet areas or floodwater, and report downed wires to your electricity board and emergency responders immediately.',
  },

  // Safe water and hygiene.
  {
    keywords: [
      'drinking water', 'clean water', 'water purification', 'cholera', 'diarrhea',
      'contaminated water', 'sanitation', 'water after flood', 'boil water',
    ],
    answer:
      'Floods can contaminate tap and well water. Drink only boiled water, bottled water, or water treated with appropriate purification tablets. Wash hands with soap before eating, and discard fresh food or open dry rations that touched floodwater.',
  },

  // Snakes and insects after floods.
  {
    keywords: [
      'snake', 'snakebite', 'snake bite', 'venom', 'insect', 'mosquito', 'snake bite first aid',
    ],
    answer:
      'Floodwaters displace snakes and insects into dry homes and debris. Use a flashlight at night, tap ahead with a stick, and shake out shoes and bedding before use. For a snakebite, keep the person calm, immobilise the limb, and get to a hospital quickly. Do not cut the wound, suck venom, or apply a tight tourniquet.',
  },

  // First aid.
  {
    keywords: [
      'first aid', 'injury', 'bleeding', 'wound', 'fracture', 'medical help', 'first aid for bleeding',
    ],
    answer:
      'For bleeding wounds, apply firm direct pressure with a clean cloth and elevate the limb if there is no fracture. Clean minor cuts with safe water and antiseptic to prevent infection from dirty floodwater. For suspected head, neck or spine injuries, keep the person still and wait for trained medical responders.',
  },

  // Driving and roads.
  {
    keywords: [
      'driving', 'car', 'bike', 'vehicle', 'road', 'bridge', 'traffic', 'driving in rain',
      'submerged bridge', 'road safety in flood',
    ],
    answer:
      'Avoid driving during severe storms or flash-flood warnings. Never drive around barricades or across submerged bridges, because the roadbed underneath may be washed out. If your vehicle stalls in rising water, abandon it and move to higher ground.',
  },

  // Documents.
  {
    keywords: [
      'documents', 'id card', 'certificates', 'valuables', 'aadhaar', 'papers',
      'important documents', 'what documents to keep safe',
    ],
    answer:
      'Store identity cards, land records, bank details, medical prescriptions and insurance papers in a sealed waterproof pouch inside your emergency kit. Keep encrypted digital photos on your phone or cloud drive as a backup.',
  },

  // Vulnerable people.
  {
    keywords: [
      'children', 'elderly', 'old people', 'pregnant', 'disabled', 'vulnerable', 'family',
      'mobility assistance', 'people needing assistance',
    ],
    answer:
      'Identify neighbours or family members who are elderly, pregnant, young children, or living with disabilities before an emergency. Help them keep a supply of essential medicines, mobility aids and an assigned buddy who can assist during an evacuation.',
  },

  // Animals.
  {
    keywords: ['animals', 'pets', 'cattle', 'livestock', 'dog', 'cow', 'pet safety'],
    answer:
      'Never leave pets or livestock tied inside flooded sheds or low-lying enclosures where they cannot escape rising water. Release them early so they can move to higher ground, or relocate them to a designated animal shelter if time allows.',
  },

  // Map interpretation.
  {
    keywords: [
      'risk tier', 'low risk', 'moderate risk', 'high risk', 'critical risk', 'weather map',
      'forecast', 'map risk levels', 'what do the colours mean',
    ],
    answer:
      'The map shows live weather observations alongside separate rain outlook and hydrology risk indicators (LOW, MODERATE, HIGH, CRITICAL). Check the observation timestamp and follow official local advisories rather than relying only on automated map scores.',
  },

  // Helplines.
  {
    keywords: [
      'helpline', 'phone number', 'call', '112', 'ndrf', 'ambulance', 'fire brigade', 'police',
      'emergency helpline', 'which emergency helpline should i call', 'emergency numbers',
      'who to call in an emergency',
    ],
    answer:
      'In India, dial 112 for the National Emergency Response System (police, fire and ambulance), 108 for emergency medical ambulance services, or 1070 / 1077 for State and District Disaster Control Rooms. Keep calls brief so lines stay open for urgent rescues.',
  },

  // Returning home after a disaster.
  {
    keywords: [
      'after the flood', 'after a cyclone', 'return home', 'go back home', 'clean up after disaster',
      'when can i return', 'post disaster safety',
    ],
    answer:
      'Return only when authorities say the area is safe. Wear boots and gloves, avoid standing water and damaged structures, photograph damage for insurance or assistance records, and boil or treat water until its safety is confirmed.',
  },
]

function normalizeMessage(message) {
  return message
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function matchesKeyword(normalizedMessage, keyword) {
  const normalizedKeyword = normalizeMessage(keyword)
  return (
    normalizedMessage === normalizedKeyword ||
    normalizedMessage.startsWith(`${normalizedKeyword} `) ||
    normalizedMessage.endsWith(` ${normalizedKeyword}`) ||
    normalizedMessage.includes(` ${normalizedKeyword} `)
  )
}

function keywordScore(normalizedMessage, keyword) {
  const normalizedKeyword = normalizeMessage(keyword)
  if (!normalizedKeyword || !matchesKeyword(normalizedMessage, normalizedKeyword)) return 0
  return normalizedKeyword.split(' ').length * 2
}

function bestMatch(message, wordLimit) {
  if (typeof message !== 'string' || !message.trim()) return null
  const normalized = normalizeMessage(message)
  if (!normalized || normalized.split(' ').length > wordLimit) return null

  let bestEntry = null
  let maxScore = 0
  for (const entry of entries) {
    const score = Math.max(...entry.keywords.map((keyword) => keywordScore(normalized, keyword)))
    if (score > maxScore) {
      maxScore = score
      bestEntry = entry
    }
  }
  return bestEntry && maxScore >= 2 ? bestEntry : null
}

export function getCachedFaqAnswer(message) {
  const entry = bestMatch(message, 18)
  if (!entry) return null
  return {
    ...entry,
    source: FAQ_SOURCE,
  }
}

export function getSafeGeneralSafetyFallback(message) {
  const entry = bestMatch(message, 40)
  if (!entry) return null
  return {
    answer: entry.answer,
    source: FAQ_SOURCE,
    topic: entry.keywords[0],
  }
}
