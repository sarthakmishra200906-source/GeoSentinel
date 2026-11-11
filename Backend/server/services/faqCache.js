const FAQ_SOURCE = {
  documentId: 'builtin-basic-safety-faq',
  title: 'GeoSentinel Basic Safety FAQ',
  issuingAuthority: 'GeoSentinel safety team',
  officialUrl: null,
  section: 'Basic safety',
  page: null,
}

const entries = [
  {
    keywords: ['basic safety', 'stay safe', 'safety measure', 'safety measures'],
    answer: 'Move away from immediate hazards, stay with your group, keep your phone charged, carry essential medicines and documents, and follow instructions from local authorities. For immediate danger, contact local emergency services first.',
  },
  {
    keywords: ['evacuation', 'evacuate', 'evacuation process'],
    answer: 'Follow an official evacuation order, leave by the recommended route, take essential medicines and documents, avoid floodwater and damaged bridges, help children and people needing assistance, and report to the designated safe location. Do not return until authorities say it is safe.',
  },
  {
    keywords: ['flood water', 'floodwater', 'water'],
    answer: 'Do not walk or drive through moving or unknown-depth floodwater. Move to higher ground if it is safe, avoid downed wires, and contact local emergency services if you are trapped or in immediate danger.',
  },
  {
    keywords: ['earthquake', 'earth quake'],
    answer: 'During shaking, drop, cover, and hold on. Stay away from windows and heavy objects, do not use lifts, and move outside only after shaking stops if the route is safe. Expect aftershocks and follow official instructions.',
  },
  {
    keywords: ['cyclone', 'hurricane', 'storm'],
    answer: 'Follow official cyclone warnings, secure loose items if it is safe, keep water, medicines, documents, and a charged phone ready, and move to the designated shelter before conditions worsen. Avoid beaches, floodwater, and damaged roads.',
  },
  {
    keywords: ['heatwave', 'heat wave', 'extreme heat'],
    answer: 'Stay in a cool or shaded place, drink water regularly, avoid strenuous activity during the hottest hours, and check on children, older people, and anyone who needs assistance. Seek urgent medical help for confusion, fainting, or severe weakness.',
  },
  {
    keywords: ['what can you do', 'what do you know', 'general help'],
    answer: 'I can provide basic disaster-safety guidance, explain evacuation and flood precautions, help you understand approved government guidance, and help you submit a location-based help report. I cannot replace emergency services or issue official orders.',
  },
]

export function getCachedFaqAnswer(message) {
  const normalized = message.toLowerCase()
  const entry = entries.find(({ keywords }) => keywords.some((keyword) => normalized.includes(keyword)))
  if (!entry) return null
  return {
    ...entry,
    source: FAQ_SOURCE,
  }
}
