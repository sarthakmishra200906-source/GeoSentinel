import PDFDocument from 'pdfkit'

const PAGE_WIDTH = 595.28
const LEFT = 30
const RIGHT = PAGE_WIDTH - 30

function peakTimestep(timesteps) {
  return timesteps.reduce(
    (peak, item) => !peak || item.impacts.riskScore > peak.impacts.riskScore ? item : peak,
    null,
  )
}

function writeLine(document, text, { size = 8, color = '#1f2937', gap = 2, bold = false } = {}) {
  document
    .font(bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(size)
    .fillColor(color)
    .text(String(text), { width: RIGHT - LEFT, lineGap: gap })
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

export function buildSimulationPdf({ run, scenario, timesteps, generatedAt = new Date() }) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({
      size: 'A4',
      margins: { top: 28, right: 30, bottom: 28, left: LEFT },
      compress: true,
      info: {
        Title: `GeoSentinel simulation ${run._id}`,
        Subject: 'Complete synthetic cyclone rehearsal evidence',
        Author: 'GeoSentinel',
        CreationDate: generatedAt,
      },
    })
    const chunks = []
    document.on('data', (chunk) => chunks.push(chunk))
    document.on('error', reject)
    document.on('end', () => resolve(Buffer.concat(chunks)))

    writeLine(document, 'GeoSentinel - Complete Cyclone Rehearsal Report', { size: 17, bold: true, gap: 5 })
    writeLine(document, 'SYNTHETIC SIMULATION - NOT AN OFFICIAL FORECAST OR LIVE OBSERVATION', {
      size: 9,
      color: '#991b1b',
      bold: true,
      gap: 6,
    })
    writeLine(document, `Run ID: ${run._id}`)
    writeLine(document, `Scenario: ${scenario.name}`)
    writeLine(document, `Status: ${run.status} | Hours recorded: ${timesteps.length}`)
    writeLine(document, `Ruleset: ${scenario.rulesetVersion} | Data source: synthetic_simulation`)
    writeLine(document, `Report generated: ${generatedAt.toISOString()}`)
    writeLine(document, 'Impact geography: Odisha rule-matrix districts with synthetic India state context.')
    writeLine(document, 'Values are decision-support rehearsal proxies; they are not gauges, official forecasts, or verified impacts.')

    const summary = createSimulationReportSummary(timesteps)
    if (summary.peakRisk) {
      writeLine(
        document,
        `Peak risk: ${summary.peakRisk.tier} (${Math.round(summary.peakRisk.score * 100)}%) at synthetic hour ${summary.peakRisk.hour}.`,
        { gap: 4 },
      )
    }

    for (const timestep of timesteps) {
      document.addPage({ size: 'A4', margins: { top: 28, right: 30, bottom: 28, left: LEFT } })
      const { cyclone, weather, impacts } = timestep
      writeLine(document, `Synthetic hour ${timestep.sequence} - ${new Date(timestep.timestamp).toISOString()}`, {
        size: 12,
        bold: true,
        gap: 4,
      })
      writeLine(
        document,
        `Risk ${impacts.riskTier} (${Math.round(impacts.riskScore * 100)}%) | ` +
          `Rain ${weather.hourlyRainfallMm} mm/h | River proxy ${weather.riverDischargeM3s} m3/s | ` +
          `Temperature proxy ${weather.temperatureC} C | Wind ${cyclone.windSpeedKmh} km/h`,
        { size: 7.5, gap: 4 },
      )
      writeLine(
        document,
        `Cyclone position ${cyclone.positionLatitude}, ${cyclone.positionLongitude} | ` +
          `Target ${cyclone.targetLatitude}, ${cyclone.targetLongitude} | ` +
          `Distance to target ${cyclone.distanceToTargetKm ?? cyclone.distanceToOdishaKm} km`,
        { size: 7.5, gap: 5 },
      )
      writeLine(document, 'ODISHA DISTRICT EVIDENCE', { size: 8, bold: true, gap: 2 })
      writeLine(document, 'District | Tier | Risk % | Rain mm/h | River signal % | Exposed institutions', {
        size: 6.5,
        bold: true,
        gap: 1,
      })
      for (const district of impacts.districts || []) {
        writeLine(
          document,
          `${district.district} | ${district.riskTier} | ${Math.round(district.riskScore * 100)} | ` +
            `${district.rainfallMm} | ${Math.round(district.riverSignal * 100)} | ${district.exposedInstitutions}`,
          { size: 6.5, gap: 0 },
        )
      }

      writeLine(document, 'INDIA STATE / UNION TERRITORY SYNTHETIC CONTEXT', {
        size: 8,
        bold: true,
        gap: 2,
      })
      writeLine(document, 'State/UT | Tier | Risk % | Rain mm/h | River proxy m3/s | Temperature proxy C', {
        size: 6.5,
        bold: true,
        gap: 1,
      })
      for (const state of impacts.states || []) {
        writeLine(
          document,
          `${state.state} | ${state.riskTier} | ${Math.round(state.riskScore * 100)} | ` +
            `${state.rainfallMm} | ${state.riverDischargeM3s} | ${state.temperatureC}`,
          { size: 6.5, gap: 0 },
        )
      }
    }

    document.end()
  })
}
