import PDFDocument from 'pdfkit'

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const LEFT = 34
const RIGHT = PAGE_WIDTH - 34
const TOP = 30
const BOTTOM = 38
const CONTENT_WIDTH = RIGHT - LEFT

const INK = '#1f2937'
const MUTED = '#64748b'
const ACCENT = '#0369a1'
const PALE = '#f0f9ff'
const BORDER = '#dbe4ee'

function peakTimestep(timesteps) {
  return timesteps.reduce(
    (peak, item) => !peak || item.impacts.riskScore > peak.impacts.riskScore ? item : peak,
    null,
  )
}

// Standard PDF fonts are WinAnsi-only. This keeps LLM text readable even when
// a model emits smart quotes, bullet glyphs or another script by accident.
function pdfSafeText(value, maxLength = 1600) {
  return String(value ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2022\u25CF]/g, '-')
    .replace(/[^\x20-\x7E\r\n]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength)
}

function writeLine(document, text, { size = 8, color = INK, gap = 2, bold = false, align = 'left' } = {}) {
  document
    .font(bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(size)
    .fillColor(color)
    .text(pdfSafeText(text), LEFT, document.y, { width: CONTENT_WIDTH, align, lineGap: gap })
}

function writeRule(document, color = BORDER) {
  const y = document.y + 4
  document.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(0.7).strokeColor(color).stroke()
  document.y = y + 8
}

function sectionTitle(document, title) {
  document.y += 4
  document.rect(LEFT, document.y - 2, CONTENT_WIDTH, 17).fill(PALE)
  document
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(ACCENT)
    .text(pdfSafeText(title), LEFT + 7, document.y + 2, { width: CONTENT_WIDTH - 14, lineBreak: false })
  document.y += 20
}

function writeParagraph(document, text, { size = 8.5, color = INK, bold = false, gap = 1.5 } = {}) {
  document
    .font(bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(size)
    .fillColor(color)
    .text(pdfSafeText(text), LEFT, document.y, { width: CONTENT_WIDTH, lineGap: gap })
}

function drawMetricCard(document, x, y, width, label, value, note) {
  document.roundedRect(x, y, width, 57, 6).fillAndStroke('#f8fafc', BORDER)
  document.font('Helvetica-Bold').fontSize(6.6).fillColor(MUTED)
    .text(pdfSafeText(label.toUpperCase()), x + 8, y + 7, { width: width - 16, lineBreak: false })
  document.font('Helvetica-Bold').fontSize(13).fillColor(ACCENT)
    .text(pdfSafeText(value), x + 8, y + 20, { width: width - 16, lineBreak: false })
  document.font('Helvetica').fontSize(6.6).fillColor(MUTED)
    .text(pdfSafeText(note), x + 8, y + 41, { width: width - 16, height: 12, lineBreak: false, ellipsis: true })
}

function writeTableRow(document, values, widths, { header = false, stripe = false, size = 6.5 } = {}) {
  const height = header ? 13 : 12
  const y = document.y
  if (header) document.rect(LEFT, y, CONTENT_WIDTH, height).fill('#e8eef5')
  else if (stripe) document.rect(LEFT, y, CONTENT_WIDTH, height).fill('#f8fafc')
  let x = LEFT
  values.forEach((value, index) => {
    document
      .font(header ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(size)
      .fillColor(header ? '#334155' : INK)
      .text(pdfSafeText(value), x + 3, y + 2.5, {
        width: widths[index] - 6,
        height: height - 3,
        lineBreak: false,
        ellipsis: true,
      })
    x += widths[index]
  })
  document.y = y + height
}

function finishPage(document, pageNumber) {
  document
    .font('Helvetica')
    .fontSize(6.8)
    .fillColor(MUTED)
    .text(
      `GeoSentinel synthetic rehearsal evidence | Page ${pageNumber}`,
      LEFT,
      PAGE_HEIGHT - BOTTOM - 10,
      { width: CONTENT_WIDTH, align: 'center', lineBreak: false },
    )
}

function pageHeader(document, title, generatedAt) {
  document.rect(0, 0, PAGE_WIDTH, 5).fill(ACCENT)
  document.y = TOP
  writeLine(document, title, { size: 11, bold: true, color: '#0f172a', gap: 1 })
  writeLine(document, `Generated ${generatedAt.toISOString()} | Synthetic rehearsal only`, {
    size: 7,
    color: MUTED,
    gap: 1,
  })
  writeRule(document)
}

export function createSimulationReportSummary(timesteps) {
  const peak = peakTimestep(timesteps)
  return {
    timestepCount: timesteps.length,
    peakRisk: peak
      ? { hour: peak.sequence, tier: peak.impacts.riskTier, score: peak.impacts.riskScore }
      : null,
    dataSource: 'synthetic_simulation',
  }
}

export function buildSimulationPdf({
  run,
  scenario,
  timesteps,
  generatedAt = new Date(),
  brief = null,
}) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({
      size: 'A4',
      margins: { top: TOP, right: 34, bottom: BOTTOM, left: LEFT },
      compress: true,
      info: {
        Title: `GeoSentinel simulation ${run._id}`,
        Subject: 'Synthetic cyclone rehearsal with AI-written decision brief',
        Author: 'GeoSentinel',
        CreationDate: generatedAt,
      },
    })
    const chunks = []
    document.on('data', (chunk) => chunks.push(chunk))
    document.on('error', reject)
    document.on('end', () => resolve(Buffer.concat(chunks)))

    const summary = createSimulationReportSummary(timesteps)
    const peak = peakTimestep(timesteps)
    const maxRain = timesteps.reduce((max, item) => Math.max(max, item.weather?.hourlyRainfallMm || 0), 0)
    const maxRiver = timesteps.reduce((max, item) => Math.max(max, item.weather?.riverDischargeM3s || 0), 0)
    const resources = (peak?.recommendations?.resources || []).reduce((total, item) => ({
      boats: total.boats + (item.boats || 0),
      paramedics: total.paramedics + (item.paramedics || 0),
      rescueTeams: total.rescueTeams + (item.rescueTeams || 0),
    }), { boats: 0, paramedics: 0, rescueTeams: 0 })
    const decisionBrief = brief || {
      userHelp: 'This isolated rehearsal created no public SOS or help report. A separate incident inbox must be tested before live use.',
      aiInsight: summary.peakRisk
        ? `Peak synthetic risk is ${summary.peakRisk.tier} at hour ${summary.peakRisk.hour}. These are rule-matrix proxies, not an official forecast or gauge reading.`
        : 'No synthetic hours were recorded, so no risk conclusion is available.',
      finalReview: 'Validate the track and rainfall against verified observations, confirm resource reservations, and sign/archive the report before operational use.',
      source: 'fallback',
      provider: 'none',
      model: 'not generated',
      warning: null,
    }

    let pageNumber = 0

    // Cover page: one screen of context before the evidence appendices.
    document.rect(0, 0, PAGE_WIDTH, 7).fill(ACCENT)
    document.y = TOP + 6
    pageNumber += 1
    writeLine(document, 'GeoSentinel', { size: 9, bold: true, color: ACCENT, gap: 0 })
    writeLine(document, 'Cyclone Rehearsal Review Report', { size: 19, bold: true, color: '#0f172a', gap: 2 })
    writeLine(document, 'Decision-support record for admin review - not an official forecast, warning or live observation', {
      size: 8,
      color: MUTED,
      gap: 4,
    })
    document.rect(LEFT, document.y, CONTENT_WIDTH, 24).fill('#fef2f2')
    document
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor('#991b1b')
      .text('SYNTHETIC SIMULATION ONLY - DO NOT USE FOR PUBLIC EVACUATION DECISIONS', LEFT + 8, document.y + 7, {
        width: CONTENT_WIDTH - 16,
        lineBreak: false,
      })
    document.y += 32

    sectionTitle(document, 'Run identity')
    const metaRows = [
      ['Run ID', String(run._id)],
      ['Scenario', scenario.name || 'Unnamed simulation'],
      ['Status', String(run.status || 'unknown')],
      ['Hours recorded', String(timesteps.length)],
      ['Ruleset', String(scenario.rulesetVersion || 'unknown')],
      ['Data source', String(scenario.dataSource || 'synthetic_simulation')],
      ['Generated', generatedAt.toISOString()],
    ]
    metaRows.forEach(([label, value], index) => {
      const y = document.y
      if (index % 2 === 0) document.rect(LEFT, y, CONTENT_WIDTH, 12).fill('#f8fafc')
      document.font('Helvetica-Bold').fontSize(7).fillColor(MUTED)
        .text(pdfSafeText(label), LEFT + 5, y + 2, { width: 95, lineBreak: false })
      document.font('Helvetica').fontSize(7).fillColor(INK)
        .text(pdfSafeText(value), LEFT + 100, y + 2, { width: CONTENT_WIDTH - 105, lineBreak: false, ellipsis: true })
      document.y = y + 12
    })

    sectionTitle(document, 'At a glance')
    const cardWidth = (CONTENT_WIDTH - 24) / 4
    const cardY = document.y
    const peakTier = summary.peakRisk?.tier || 'NONE'
    drawMetricCard(document, LEFT, cardY, cardWidth, 'Peak risk', peakTier, summary.peakRisk ? `Hour ${summary.peakRisk.hour}` : 'No hours')
    drawMetricCard(document, LEFT + cardWidth + 8, cardY, cardWidth, 'Peak rainfall', `${maxRain.toFixed(1)} mm/h`, 'Rule-matrix proxy')
    drawMetricCard(document, LEFT + (cardWidth + 8) * 2, cardY, cardWidth, 'River signal', `${maxRiver.toFixed(0)} m3/s`, 'Not a gauge reading')
    drawMetricCard(document, LEFT + (cardWidth + 8) * 3, cardY, cardWidth, 'Advice at peak', `${resources.rescueTeams} teams`, `${resources.boats} boats, ${resources.paramedics} medics`)
    document.y = cardY + 65

    sectionTitle(document, 'AI-written decision brief')
    const briefBlocks = [
      ['USER HELP / REPORTS', decisionBrief.userHelp],
      ['AI INSIGHT', decisionBrief.aiInsight],
      ['FINAL REVIEW', decisionBrief.finalReview],
    ]
    for (const [label, text] of briefBlocks) {
      document.font('Helvetica-Bold').fontSize(7.5).fillColor(ACCENT)
        .text(pdfSafeText(label), LEFT, document.y, { width: CONTENT_WIDTH, lineBreak: false })
      document.y += 11
      writeParagraph(document, text, { size: 8, gap: 1 })
      document.y += 4
    }
    writeLine(
      document,
      `Brief source: ${decisionBrief.source || 'fallback'} | Model: ${decisionBrief.model || 'not generated'}`,
      { size: 6.8, color: MUTED },
    )
    if (decisionBrief.warning) {
      writeLine(document, `Note: ${pdfSafeText(decisionBrief.warning, 220)}`, { size: 6.8, color: '#92400e' })
    }

    sectionTitle(document, 'How to read this report')
    writeParagraph(
      document,
      'Each hourly appendix records one synthetic step from this rehearsal. District tiers and institution counts come from an internal rule matrix; rain, river and temperature values are proxies derived from the configured scenario, not observations from gauges or an official meteorological bulletin. No citizen SOS, dispatch order, shelter capacity or live incident data is attached to this run.',
      { size: 8 },
    )
    finishPage(document, pageNumber)

    for (const timestep of timesteps) {
      document.addPage({ size: 'A4', margins: { top: TOP, right: 34, bottom: BOTTOM, left: LEFT } })
      pageNumber += 1
      const { cyclone, weather, impacts } = timestep
      pageHeader(document, `Synthetic hour ${timestep.sequence} - evidence appendix`, generatedAt)

      sectionTitle(document, 'Conditions at this hour')
      const targetText = cyclone.targetLatitude !== undefined && cyclone.targetLongitude !== undefined
        ? `${cyclone.targetLatitude}, ${cyclone.targetLongitude}`
        : 'Not used (forward forecast)'
      const distanceText = cyclone.distanceToTargetKm ?? cyclone.distanceToOdishaKm
        ? `${cyclone.distanceToTargetKm ?? cyclone.distanceToOdishaKm} km to target`
        : `${cyclone.distanceToStartKm ?? 'n/a'} km from start`
      const hourRows = [
        ['Risk', `${impacts.riskTier} (${Math.round(impacts.riskScore * 100)}%)`],
        ['Rainfall proxy', `${weather.hourlyRainfallMm} mm/h`],
        ['River proxy', `${weather.riverDischargeM3s} m3/s`],
        ['Temperature proxy', `${weather.temperatureC} C`],
        ['Wind', `${cyclone.windSpeedKmh} km/h`],
        ['Eye position', `${cyclone.positionLatitude}, ${cyclone.positionLongitude}`],
        ['Target', targetText],
        ['Distance', distanceText],
        ...(cyclone.effectiveHeadingDeg !== undefined
          ? [['Effective heading', `${Number(cyclone.effectiveHeadingDeg).toFixed(1)} deg, ${cyclone.forwardSpeedKmh} km/h`]]
          : []),
        ...(cyclone.trackModel ? [['Track model', cyclone.trackModel]] : []),
        ['Landfall flag', cyclone.isLandfall ? 'Yes at this hour' : 'No at this hour'],
      ]
      hourRows.forEach(([label, value], index) => {
        const y = document.y
        if (index % 2 === 0) document.rect(LEFT, y, CONTENT_WIDTH, 12).fill('#f8fafc')
        document.font('Helvetica-Bold').fontSize(6.8).fillColor(MUTED)
          .text(pdfSafeText(label), LEFT + 5, y + 2, { width: 115, lineBreak: false })
        document.font('Helvetica').fontSize(6.8).fillColor(INK)
          .text(pdfSafeText(value), LEFT + 120, y + 2, { width: CONTENT_WIDTH - 125, lineBreak: false, ellipsis: true })
        document.y = y + 12
      })

      sectionTitle(document, 'Odisha district rule-matrix evidence')
      const districtWidths = [115, 58, 48, 62, 76, 90]
      writeTableRow(document, ['District', 'Tier', 'Risk %', 'Rain mm/h', 'River signal %', 'Exposed institutions'], districtWidths, { header: true })
      ;(impacts.districts || []).forEach((district, index) => {
        writeTableRow(document, [
          district.district,
          district.riskTier,
          Math.round(district.riskScore * 100),
          district.rainfallMm,
          Math.round(district.riverSignal * 100),
          district.exposedInstitutions,
        ], districtWidths, { stripe: index % 2 === 1 })
      })

      sectionTitle(document, 'India state / union territory synthetic context')
      const stateWidths = [140, 62, 50, 78, 95, 80]
      writeTableRow(document, ['State / UT', 'Tier', 'Risk %', 'Rain mm/h', 'River m3/s', 'Temp C'], stateWidths, { header: true })
      ;(impacts.states || []).forEach((state, index) => {
        writeTableRow(document, [
          state.state,
          state.riskTier,
          Math.round(state.riskScore * 100),
          state.rainfallMm,
          state.riverDischargeM3s,
          state.temperatureC,
        ], stateWidths, { stripe: index % 2 === 1 })
      })
      finishPage(document, pageNumber)
    }

    document.end()
  })
}
