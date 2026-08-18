const AP_FREIGHT_PREVIEW = {
  source: 'dummy',
  provider: 'DOT Gate Prequalification',
  companyName: 'AP FREIGHT INC',
  searchedAgainUrl: '#search-again',
  invitationUrl: '/_s/client/Invitation/CreateInvitation.aspx',
  requirements: {
    title: 'AP FREIGHT INC Requirements',
    rules: [
      { rule: 'Op Status', result: 'PASS', comment: '' },
      { rule: 'DOT Auth', result: 'PASS', comment: '' },
      { rule: 'DOT Auth Time', result: 'PASS', comment: '' },
      { rule: 'DOT Safety', result: 'PASS', comment: '' },
      { rule: 'Intrastate DOTNumber', result: 'N/A', comment: '' },
      { rule: 'Other', result: 'PASS', comment: '' },
    ],
  },
  rmis: {
    title: 'RMIS INFORMATION',
    contactChangeNote: "There were changes to this carrier's RMIS contact(s) 63 days ago.",
    alreadyRegistered: 'NO',
    companyName: 'Ap Freight Inc',
    addressLines: ['4460 W Shaw Ave Ste 620', 'Fresno, CA 93722', 'USA'],
    contact: 'karan Thind',
    phone: '559-398-5555',
    email: 'Karan@apfreightinc.com',
    mcNumber: 'MC1117318',
    dotNumber: '3440592',
    carrierAsCertified: 0,
    carrierAsNonCertified: 10,
    monitoringThisCarrier: 10,
    addedToRmis: '8/4/2020',
    eldStatus: 'Not Connected',
  },
  dotCensus: {
    title: 'DOT CENSUS INFORMATION',
    changeNote: "There have been no changes to the carrier's DOT contact information in the past 180 days.",
    physicalAddress: '4460 W SHAW AVE STE 620\nFRESNO, CA 93722',
    mailingAddress: '4460 W SHAW AVE STE 620\nFRESNO, CA 93722',
    companyRep1: 'PALVINDER SINGH',
    companyRep2: 'PALVINDER SINGH',
    phone: '559-273-2001',
    cell: '559-273-2001',
    email: 'APFREIGHT559@GMAIL.COM',
    note: "Results are based on those customers' business rules and certification requirements. This carrier may or may not be able to be certified given your company's specific rules and requirements.",
  },
  coverages: {
    title: 'CARRIER COVERAGES',
    items: [
      {
        type: 'Auto',
        limit: '$750,000.00',
        underwriter: 'United Financial Casualty Company',
        amBest: 'A+',
        expiration: '9/26/2026',
        cancellation: 'N/A',
      },
      {
        type: 'Cargo',
        limit: 'N/A',
        underwriter: 'N/A',
        amBest: 'N/A',
        expiration: 'N/A',
        cancellation: 'N/A',
      },
      {
        type: 'General',
        limit: '$2,000,000.00',
        underwriter: 'Hudson Excess Insurance Company',
        amBest: 'A+',
        expiration: '4/9/2026',
        cancellation: 'N/A',
      },
      {
        type: "Worker's Comp",
        limit: '$1,000,000.00',
        underwriter: 'Sequoia Insurance Company',
        amBest: 'A-',
        expiration: '3/23/2026',
        cancellation: 'N/A',
      },
    ],
    comments: 'Insurance does not meet requirements.',
  },
  identityRiskWarnings: {
    title: 'IDENTITY RISK WARNINGS',
    contactsCount: 3,
    addressCount: 0,
    mismatches: [
      {
        label: 'Name Mismatch',
        items: [
          { source: 'RMIS', value: 'karan Thind' },
          { source: 'DOT Rep 1', value: 'PALVINDER SINGH' },
          { source: 'DOT Rep 2', value: 'PALVINDER SINGH' },
        ],
      },
      {
        label: 'Phone Number Mismatch',
        items: [
          { source: 'RMIS', value: '559-398-5555' },
          { source: 'DOT Tel', value: '559-273-2001' },
          { source: 'DOT Cell', value: '559-273-2001' },
        ],
      },
      {
        label: 'Email Mismatch',
        items: [
          { source: 'RMIS', value: 'Karan@apfreightinc.com' },
          { source: 'DOT', value: 'APFREIGHT559@GMAIL.COM' },
        ],
      },
    ],
  },
  carrierAssure: {
    title: 'CARRIER ASSURE',
    usDot: {
      title: 'U.S. DOT INFORMATION',
      docketNumber: 'MC1117318',
      legalName: 'AP FREIGHT INC',
      dbaName: '',
      address: '4460 W SHAW AVE STE 620, FRESNO, CA 93722',
      operatingStatus: 'AUTHORIZED FOR BROKER Property',
      outOfServiceDate: '',
    },
    safetyRating: {
      title: 'CARRIER SAFETY RATING',
      ratingDate: '',
      rating: 'None',
      reviewDate: '',
      reviewType: 'None',
      totalPowerUnits: 1,
      totalDrivers: 1,
    },
    authority: {
      title: 'AUTHORITY INFORMATION',
      commonAuthority: 'N',
      contractAuthority: 'A',
      brokerAuthority: 'A',
      commonAuthorityGrantDate: '',
      commonAuthorityOriginalGrantDate: '',
      commonAuthorityReinstateDate: '',
      commonAuthorityLastRevocationDate: '',
      contractAuthorityGrantDate: '',
      contractAuthorityOriginalGrantDate: '7/6/2020',
      contractAuthorityReinstateDate: '9/27/2022',
      contractAuthorityLastRevocationDate: '6/30/2021',
      brokerAuthorityGrantDate: '12/17/2020',
      brokerAuthorityOriginalGrantDate: '12/17/2020',
      brokerAuthorityReinstateDate: '',
      brokerAuthorityLastRevocationDate: '',
      boc3: '',
    },
    drivers: {
      title: 'DRIVERS',
      interstateDriversUnder100Miles: 0,
      interstateDrivers100PlusMiles: 1,
      totalInterstateDrivers: 0,
      intrastateDriversUnder100Miles: 0,
      intrastateDrivers100PlusMiles: 0,
      totalIntrastateDrivers: 1,
      totalInterstateAndIntrastateDrivers: 1,
      cdlEmployedDrivers: 1,
      monthlyAverageLeasedDrivers: 0,
    },
    equipment: {
      title: 'EQUIPMENT',
      fleetSize: 1,
      totalPowerUnits: 1,
      totalTractorsAndTrucks: 1,
      rows: [
        { type: 'Tractors', owned: 1, termLeased: 0, tripLeased: 0 },
        { type: 'Trucks', owned: 0, termLeased: 0, tripLeased: 0 },
        { type: 'Trailers', owned: 1, termLeased: 0, tripLeased: 0 },
      ],
    },
    inspections: {
      title: 'DOT INSPECTIONS',
      rows: [
        { type: 'Inspections', vehicles: '0.0', drivers: '0.0' },
        { type: 'Out of Service', vehicles: '0.0', drivers: '0.0' },
        { type: 'Out of Service %', vehicles: '0%', drivers: '0%' },
        { type: "US - Nat'l Average %", vehicles: '22.26%', drivers: '6.67%' },
        { type: 'Canada - Inspections', vehicles: '0.0', drivers: '0.0' },
        { type: 'Canada - Out of Service', vehicles: '0.0', drivers: '0.0' },
        { type: 'Canada - Out of Service %', vehicles: '0%', drivers: '0%' },
      ],
    },
  },
  phmsa: {
    message: 'No carrier PHMSA information on file.',
  },
  support: {
    phone: '559-398-5555',
    email: 'Safety@apfreightinc.com',
    message:
      'For help or questions please contact the AP FREIGHT INC representative you are working with at 559-398-5555 or Safety@apfreightinc.com.',
    copyright: '© 2026 Truckstop. All rights reserved.',
    rmisStatus: 'RMIS Status - Partially Degraded Service',
  },
  invitation: {
    title: 'Create Invitation',
    instructions:
      'If you require a unique identifier to be associated to the carrier, please enter in the ID in the “Client Insured Number” field, and it will automatically save as the “ClientCarrierID” upon registration completion.',
    heading: 'PLEASE FILL OUT THE INVITATION BELOW.',
    carrierName: 'Ap Freight Inc',
    clientInsuredNumber: '',
    carrierContact: 'karan Thind',
    carrierEmail: 'Karan@apfreightinc.com',
    requesterName: 'Dimple Rattanpal',
    requesterEmail: 'dimple@apfreightinc.com',
  },
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '')
}

function formatMc(docketType, number) {
  const type = String(docketType || 'MC').toUpperCase()
  const digits = digitsOnly(number)
  if (!digits) return AP_FREIGHT_PREVIEW.rmis.mcNumber
  return `${type}${digits}`
}

export function getDotGateDummyPreview(search = {}, actor = {}) {
  const preview = JSON.parse(JSON.stringify(AP_FREIGHT_PREVIEW))
  const docketType = String(search.docketType || 'MC').toUpperCase()
  const docketNumber = String(search.docketNumber || '').trim()
  const usDotNumber = String(search.usDotNumber || '').trim()
  const mcNumber = formatMc(docketType, docketNumber)
  const dotNumber = digitsOnly(usDotNumber) || preview.rmis.dotNumber

  preview.searchedAt = new Date().toISOString()
  preview.searchedIdentifier = {
    docketType,
    docketNumber: docketNumber || digitsOnly(mcNumber),
    usDotNumber: usDotNumber || dotNumber,
    intrastateState: search.intrastateState || '',
    intrastateNumber: search.intrastateNumber || '',
  }
  preview.rmis.mcNumber = mcNumber
  preview.rmis.dotNumber = dotNumber
  preview.carrierAssure.usDot.docketNumber = mcNumber
  if (actor.name) preview.invitation.requesterName = actor.name
  if (actor.email) preview.invitation.requesterEmail = actor.email
  return preview
}

export default AP_FREIGHT_PREVIEW
