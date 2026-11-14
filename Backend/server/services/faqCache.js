const FAQ_SOURCE = {
  documentId: 'builtin-basic-safety-faq',
  title: 'GeoSentinel Basic Safety FAQ',
  issuingAuthority: 'GeoSentinel safety team',
  officialUrl: null,
  section: 'Basic safety',
  page: null,
}

const entries = [
  // 1. Greetings & Conversational Openers (Prevents LLM calls on "hi", "hello", "help")
  {
    keywords: [
      'hi',
      'hii',
      'hiii',
      'hiiii',
      'hello',
      'helloo',
      'hey',
      'heyy',
      'namaste',
      'good morning',
      'good evening',
      'start',
    ],
    answer:
      'Hello! I am the Resq-AI Disaster Assistance Guide. Ask me about flood precautions, cyclone readiness, lightning or heatwave safety, first aid, or how to find nearby rescue centers. If you are in immediate physical danger, please contact local emergency services right away.',
  },

  // 2. Capabilities & Platform Help
  {
    keywords: ['what can you do', 'what do you know', 'general help', 'how do you work', 'features', 'who are you'],
    answer:
      'I can guide you through step-by-step safety actions for floods, cyclones, heatwaves, earthquakes, landslides, and lightning, explain approved government disaster guidelines, and help you locate rescue shelters or submit an SOS help report. Note that I provide informational guidance only and cannot issue official evacuation orders or replace emergency responders.',
  },

  // 3. Using the SOS / Help Now Button
  {
    keywords: ['sos', 'help now', 'emergency report', 'send help', 'how to report', 'rescue me', 'trapped'],
    answer:
      'If you or someone nearby needs urgent assistance, tap the red "Help now" button in the menu to submit your live GPS location and situation details to the response team. If you are in immediate life-threatening danger, call your local emergency services first and move to higher or safer ground if possible.',
  },

  // 4. Finding Rescue Centers & Shelters
  {
    keywords: ['rescue center', 'rescue centre', 'shelter', 'safe place', 'relief camp', 'where to go'],
    answer:
      'You can view verified rescue centers, current bed/occupancy availability, and amenities (water, medical aid, backup power) directly on the live map or in the Rescue Centers directory. Always confirm shelter status before traveling and avoid crossing flooded roads on your way.',
  },

  // 5. General Basic Safety & Go-Bag
  {
    keywords: ['basic safety', 'stay safe', 'safety measure', 'safety measures', 'emergency kit', 'go bag', 'what to pack'],
    answer:
      'Keep an emergency go-bag ready with drinking water, dry food, essential prescription medicines, a flashlight, a charged power bank, a whistle, and waterproof copies of IDs and medical records. Stay tuned to official alerts and move away from unstable structures or low-lying areas early.',
  },

  // 6. Evacuation Process
  {
    keywords: ['evacuation', 'evacuate', 'evacuation process', 'leave home', 'when to leave'],
    answer:
      'When authorities issue an evacuation advisory, leave early using designated safe routes rather than waiting until conditions peak. Switch off your main electricity and gas supply before locking up, carry essential medicines and documents, assist children and elderly neighbors, and never return until officials declare the area safe.',
  },

  // 7. Floodwater & Urban Flooding
  {
    keywords: ['flood water', 'floodwater', 'flood', 'flooding', 'waterlogging', 'heavy rain'],
    answer:
      'Never walk, swim, or drive through moving or murky floodwater—just 15 cm of fast-moving water can knock you down, and 30 cm can sweep away a vehicle. Move to an upper floor or higher ground, stay clear of submerged electrical poles or downed wires, and boil or chlorinate drinking water after floods.',
  },

  // 8. Cyclone & Severe Storm Readiness
  {
    keywords: ['cyclone', 'hurricane', 'storm', 'gale', 'landfall', 'coastal warning'],
    answer:
      'Before a cyclone makes landfall, secure loose outdoor items, reinforce glass windows, charge all phones and power banks, and store at least 3 days of clean drinking water. Move to a designated cyclone shelter if you live in a coastal or weak structure, and stay indoors during the calm "eye" of the storm—violent winds resume shortly after.',
  },

  // 9. Thunderstorm & Lightning Safety (Critical in Odisha & Eastern India)
  {
    keywords: ['lightning', 'thunderstorm', 'thunder', 'bijli', 'cloudburst'],
    answer:
      'When you hear thunder, move immediately into a sturdy enclosed building or hard-topped vehicle—never shelter under tall isolated trees, open sheds, or near metal poles. Unplug non-essential appliances, stay away from windows and running water, and wait at least 30 minutes after the last thunderclap before going outside.',
  },

  // 10. Earthquake Safety
  {
    keywords: ['earthquake', 'earth quake', 'tremor', 'shaking', 'seismic'],
    answer:
      'Drop to your hands and knees, cover your head and neck under a sturdy table or against an interior wall away from glass, and hold on until the shaking stops. Do not use elevators or run outside while debris is falling. Once shaking stops, evacuate calmly to an open area and prepare for aftershocks.',
  },

  // 11. Heatwave & Sunstroke Protection
  {
    keywords: ['heatwave', 'heat wave', 'extreme heat', 'sunstroke', 'heat stroke', 'dehydration', 'loo'],
    answer:
      'Avoid direct sun and heavy physical work between 11:00 AM and 4:00 PM, wear loose light-colored cotton clothes, and drink water or ORS regularly even if you do not feel thirsty. Check frequently on elderly family members and children; seek urgent medical care immediately if someone shows confusion, hot dry skin, dizziness, or fainting.',
  },

  // 12. Landslide & Mudslide Safety
  {
    keywords: ['landslide', 'mudslide', 'hill collapse', 'rockfall', 'slope'],
    answer:
      'During intense or prolonged rain in hilly areas, watch for warning signs like muddy water suddenly appearing in streams, cracking sounds from trees, or tilting poles. Move away from the path of a landslide toward higher, stable ground perpendicular to the flow, and stay clear of the slide area afterward as secondary slides often follow.',
  },

  // 13. Electrical Hazards & Downed Power Lines
  {
    keywords: ['electric', 'electricity', 'power line', 'downed wire', 'short circuit', 'electrocution', 'power cut'],
    answer:
      'Treat every fallen or sagging power line as live and lethal—stay at least 10 meters away and keep others clear. Never touch electrical switches, appliances, or breaker boxes while standing in wet areas or floodwater, and report downed wires to your local electricity board and emergency responders immediately.',
  },

  // 14. Safe Drinking Water & Post-Flood Hygiene
  {
    keywords: ['drinking water', 'clean water', 'water purification', 'cholera', 'diarrhea', 'contaminated water', 'sanitation'],
    answer:
      'Floods frequently contaminate tap and well water. Drink only boiled water (rolling boil for at least 1 minute), bottled water, or water treated with chlorine/halazone tablets. Wash hands thoroughly with soap before eating and discard any fresh food or open dry rations that came into contact with floodwater.',
  },

  // 15. Snakebite & Post-Flood Wildlife Precautions
  {
    keywords: ['snake', 'snakebite', 'snake bite', 'venom', 'insect', 'mosquito'],
    answer:
      'Floodwaters displace snakes and insects into dry homes and debris. Use a flashlight when walking at night, tap ahead with a stick, and shake out shoes or bedding before use. If someone is bitten by a snake, keep them calm, immobilize the bitten limb below heart level, and rush to the nearest hospital—never cut the wound, suck venom, or apply a tight tourniquet.',
  },

  // 16. Basic First Aid & Wounds
  {
    keywords: ['first aid', 'injury', 'bleeding', 'wound', 'fracture', 'medical help'],
    answer:
      'For bleeding wounds, apply firm direct pressure using a clean cloth and elevate the injured limb if there is no fracture. Clean minor cuts with safe water and antiseptic to prevent infection from dirty floodwater. For suspected head, neck, or spine injuries, keep the person still and wait for trained medical responders.',
  },

  // 17. Vehicle & Driving Safety in Bad Weather
  {
    keywords: ['driving', 'car', 'bike', 'vehicle', 'road', 'bridge', 'traffic'],
    answer:
      'Avoid driving during severe storms or flash-flood warnings. Never drive around road barricades or across submerged bridges—roadbeds beneath floodwater may be washed out. If your vehicle stalls in rising water, abandon it immediately and move to higher ground.',
  },

  // 18. Protecting Documents & Valuables
  {
    keywords: ['documents', 'id card', 'certificates', 'valuables', 'aadhaar', 'papers'],
    answer:
      'Store critical documents—such as Aadhaar/ID cards, land records, bank details, medical prescriptions, and insurance papers—inside a sealed waterproof pouch in your emergency kit, and keep encrypted digital photos on your phone or cloud drive.',
  },

  // 19. Caring for Children, Elderly & Vulnerable People
  {
    keywords: ['children', 'elderly', 'old people', 'pregnant', 'disabled', 'vulnerable', 'family'],
    answer:
      'Identify neighbors or family members who are elderly, pregnant, young children, or living with disabilities before an emergency strikes. Ensure they have a 7-day supply of necessary medications, mobility aids, and an assigned buddy to assist them quickly during an evacuation.',
  },

  // 20. Livestock & Pets Safety
  {
    keywords: ['animals', 'pets', 'cattle', 'livestock', 'dog', 'cow'],
    answer:
      'Never leave pets or livestock tied up inside flooded sheds or low-lying enclosures where they cannot escape rising water. Untie livestock early so they can move to higher ground, or relocate them to designated high-altitude animal shelters if time permits.',
  },

  // 21. Understanding Risk Tiers on the Map
  {
    keywords: ['risk tier', 'low risk', 'moderate risk', 'high risk', 'critical risk', 'weather map', 'forecast'],
    answer:
      'The map displays live weather observations alongside separated rain outlook and hydrology risk indicators (LOW, MODERATE, HIGH, CRITICAL). Always check the observation timestamp and follow official local government advisories rather than relying solely on automated map scores.',
  },

  // 22. Official Emergency Helplines (India)
  {
    keywords: ['helpline', 'phone number', 'call', '112', 'ndrf', 'ambulance', 'fire brigade', 'police'],
    answer:
      'In India, dial 112 for the National Emergency Response System (Police, Fire, and Ambulance), 108 for emergency medical ambulance services, or 1070 / 1077 for State and District Disaster Control Rooms. Keep calls brief so lines remain open for urgent rescues.',
  },
];

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

export function getCachedFaqAnswer(message) {
  if (typeof message !== 'string' || !message.trim()) return null
  const normalized = normalizeMessage(message)
  if (normalized.split(' ').length > 10) return null
  const entry = entries.find(({ keywords }) =>
    keywords.some((keyword) => matchesKeyword(normalized, keyword)),
  )
  if (!entry) return null
  return {
    ...entry,
    source: FAQ_SOURCE,
  }
}
