import type { MatchedMedicine, Medicine } from './types'

// Ported from RxReaderPro EnhancedMedicineMatcher.kt
const MEDICAL_CONTEXT_DATABASE: Record<string, string[]> = {
  pain: ['Paracetamol', 'Ibuprofen', 'Aspirin'],
  infection: ['Amoxicillin', 'Azithromycin', 'Ciprofloxacin'],
  inflammation: ['Ibuprofen', 'Prednisone'],
  diabetes: ['Metformin', 'Insulin'],
  'blood pressure': ['Lisinopril', 'Losartan', 'Metoprolol'],
}

export function extractDosage(text: string): string | null {
  const match = /(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|tablet|capsule|pill)\b/i.exec(text)
  return match ? match[0].trim() : null
}

export function parseMedicineCsv(csv: string): Medicine[] {
  const medicines: Medicine[] = []
  const lines = csv.split(/\r?\n/)
  // Skip header: Title,Text,Text1
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    const parts = line.split(',')
    if (parts.length < 3) continue
    const name = parts[0].trim()
    const fullName = parts[2].trim()
    if (!name) continue
    const dosage = extractDosage(name) ?? extractDosage(fullName) ?? 'Unknown'
    const brandNames = [name, fullName].filter((b) => b.length > 0)
    medicines.push({
      name,
      brandNames,
      category: '',
      dosage,
      description: fullName,
      generic: name,
      dosageOptions: [dosage],
    })
  }
  return medicines
}

export function matchMedicines(ocrText: string, medicineDatabase: Medicine[]): MatchedMedicine[] {
  const matches: MatchedMedicine[] = []
  const normalizedText = ocrText.toLowerCase()

  // Step 1+2: name/generic/brand matching with confidence
  for (const medicine of medicineDatabase) {
    const confidence = calculateAIConfidence(normalizedText, medicine)
    if (confidence >= 0.3) {
      matches.push({ medicine, confidence })
    }
  }

  // Step 3: medical context matching
  for (const [keyword, names] of Object.entries(MEDICAL_CONTEXT_DATABASE)) {
    if (normalizedText.includes(keyword.toLowerCase())) {
      for (const medicineName of names) {
        const medicine = medicineDatabase.find((m) => m.name.toLowerCase() === medicineName.toLowerCase())
        if (medicine) {
          matches.push({ medicine, confidence: 0.6 })
        }
      }
    }
  }

  // Step 4: fuzzy matching
  for (const medicine of medicineDatabase) {
    const fuzzyConfidence = fuzzyMatch(normalizedText, medicine.name.toLowerCase())
    if (fuzzyConfidence >= 0.7) {
      const existing = matches.find((m) => m.medicine.name === medicine.name)
      if (!existing || fuzzyConfidence > existing.confidence) {
        if (existing) matches.splice(matches.indexOf(existing), 1)
        matches.push({ medicine, confidence: fuzzyConfidence })
      }
    }
  }

  // Step 5: word-based partial matching
  for (const word of normalizedText.split(/[\s,;]+/)) {
    if (word.length >= 4) {
      for (const medicine of medicineDatabase) {
        if (medicine.name.toLowerCase().includes(word)) {
          if (!matches.find((m) => m.medicine.name === medicine.name)) {
            matches.push({ medicine, confidence: 0.5 })
          }
        }
      }
    }
  }

  // Step 6: dosage-based matching
  const dosagePattern = /(\d+)\s*(mg|mcg|g|ml)/g
  for (const match of normalizedText.matchAll(dosagePattern)) {
    const dosage = match[0]
    for (const medicine of medicineDatabase) {
      if (medicine.dosageOptions.some((d) => d.toLowerCase().includes(dosage.toLowerCase()))) {
        if (!matches.find((m) => m.medicine.name === medicine.name)) {
          matches.push({ medicine, confidence: 0.4 })
        }
      }
    }
  }

  return matches.sort((a, b) => b.confidence - a.confidence).slice(0, 5)
}

function calculateAIConfidence(text: string, medicine: Medicine): number {
  const medicineName = medicine.name.toLowerCase()
  const genericName = medicine.generic.toLowerCase()
  let confidence = 0

  if (text.includes(medicineName)) confidence += 0.9
  if (text.includes(genericName)) confidence += 0.8
  if (text.includes(medicineName.slice(0, 4))) confidence += 0.5
  for (const dosage of medicine.dosageOptions) {
    if (text.includes(dosage.toLowerCase())) confidence += 0.3
  }
  if (text.includes('pain') && medicineName.includes('paracetamol')) confidence += 0.2
  if (text.includes('infection') && medicineName.includes('amoxicillin')) confidence += 0.2
  if (text.includes('inflammation') && medicineName.includes('ibuprofen')) confidence += 0.2

  return Math.min(confidence, 1)
}

function fuzzyMatch(text: string, medicineName: string): number {
  const longer = text.length > medicineName.length ? text : medicineName
  const shorter = text.length > medicineName.length ? medicineName : text
  if (longer.length === 0) return 1
  return (longer.length - levenshteinDistance(longer, shorter)) / longer.length
}

function levenshteinDistance(s1: string, s2: string): number {
  const dp: number[][] = Array.from({ length: s1.length + 1 }, () => new Array(s2.length + 1).fill(0))
  for (let i = 0; i <= s1.length; i++) dp[i][0] = i
  for (let j = 0; j <= s2.length; j++) dp[0][j] = j
  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[s1.length][s2.length]
}
