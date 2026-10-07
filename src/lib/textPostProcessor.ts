import type { DoctorInfo, MedicationInfo, PatientInfo, ProcessedPrescription } from './types'

// Ported from RxReaderPro TextPostProcessor.kt
const SIMPLE_MEDICATION_PATTERN = /([A-Z][a-z]+)\s+([0-9]+\s*(?:mg|mcg|g|ml))\s*(?:-|\s+)?(.*)/i
const NAME_STRENGTH_PATTERN = /([A-Z][a-z]+)\s+([0-9]+\s*(?:mg|mcg|g|ml))/i
const FALLBACK_MEDICATIONS: [string, string][] = [
  ['paracetamol', '500mg'],
  ['ibuprofen', '400mg'],
  ['amoxicillin', '250mg'],
]
const FREQUENCY_PATTERN = /(?:take|use|apply|inhale)\s+(\d+)\s*(?:times?\s*)?(?:per|a|an|\/)\s*(?:day|week|month|hr|hour|h)/i
const DURATION_PATTERN = /(?:for|x|×)\s*(\d+)\s*(?:days?|weeks?|months?|yrs?|years?)/i
const PATIENT_NAME_PATTERN = /(?:patient|name|pt):?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i
const PATIENT_DOB_PATTERN = /(?:dob|d\.o\.b\.|birth):?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i
const PATIENT_ID_PATTERN = /(?:id|mrn|nhs|health\s+card):?\s*([A-Z0-9-]+)/i
const DOCTOR_NAME_PATTERN = /(?:dr\.?|doctor|prescriber):?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i
const DOCTOR_LICENSE_PATTERN = /(?:license|lic\.?)\s*:?\s*([A-Z0-9-]+)/i
const NUMERIC_DATE_PATTERN = /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/
const WRITTEN_DATE_PATTERN = /(?:date):?\s*(.*?)(?=\n|$)/i
const INSTRUCTION_KEYWORDS = new Set(['take', 'use', 'apply', 'inhale', 'as directed', 'prn'])

export function processPrescriptionText(rawText: string): ProcessedPrescription {
  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  return {
    rawText,
    medication: extractMedicationInfo(lines),
    patientInfo: extractPatientInfo(lines),
    doctorInfo: extractDoctorInfo(lines),
    date: extractDateInfo(lines),
    instructions: extractInstructions(lines),
  }
}

function extractMedicationInfo(lines: string[]): MedicationInfo[] {
  const medications: MedicationInfo[] = []

  for (const line of lines) {
    let medicationFound = false

    const match1 = SIMPLE_MEDICATION_PATTERN.exec(line)
    if (match1) {
      const [, name, strength, instructions] = match1
      medications.push({
        name: name.trim(),
        strength: strength.trim(),
        frequency: extractFrequency(instructions),
        duration: extractDuration(instructions),
        instructions: instructions.trim(),
      })
      medicationFound = true
    }

    if (!medicationFound) {
      const match2 = NAME_STRENGTH_PATTERN.exec(line)
      if (match2) {
        const [, name, strength] = match2
        medications.push({
          name: name.trim(),
          strength: strength.trim(),
          frequency: '',
          duration: '',
          instructions: line.slice(line.indexOf(strength) + strength.length).trim(),
        })
        medicationFound = true
      }
    }

    if (!medicationFound) {
      const fallback = FALLBACK_MEDICATIONS.find(([drug]) => line.toLowerCase().includes(drug))
      if (fallback) {
        const [drug, defaultStrength] = fallback
        medications.push({
          name: drug.charAt(0).toUpperCase() + drug.slice(1),
          strength: defaultStrength,
          frequency: 'twice daily',
          duration: 'as needed',
          instructions: line,
        })
      }
    }
  }

  return medications
}

function extractFrequency(text: string): string {
  return FREQUENCY_PATTERN.exec(text)?.[0] ?? ''
}

function extractDuration(text: string): string {
  return DURATION_PATTERN.exec(text)?.[0] ?? ''
}

function extractPatientInfo(lines: string[]): PatientInfo {
  const info: PatientInfo = { name: '', dateOfBirth: '', patientId: '' }
  for (const line of lines) {
    info.name = PATIENT_NAME_PATTERN.exec(line)?.[1] ?? info.name
    info.dateOfBirth = PATIENT_DOB_PATTERN.exec(line)?.[1] ?? info.dateOfBirth
    info.patientId = PATIENT_ID_PATTERN.exec(line)?.[1] ?? info.patientId
  }
  return info
}

function extractDoctorInfo(lines: string[]): DoctorInfo {
  const info: DoctorInfo = { name: '', licenseNumber: '' }
  for (const line of lines) {
    info.name = DOCTOR_NAME_PATTERN.exec(line)?.[1] ?? info.name
    info.licenseNumber = DOCTOR_LICENSE_PATTERN.exec(line)?.[1] ?? info.licenseNumber
  }
  return info
}

function extractDateInfo(lines: string[]): string {
  for (const line of lines) {
    const numeric = NUMERIC_DATE_PATTERN.exec(line)
    if (numeric) return numeric[1]
    const written = WRITTEN_DATE_PATTERN.exec(line)
    if (written) return written[1].trim()
  }
  return ''
}

function extractInstructions(lines: string[]): string {
  return lines
    .filter((line) => [...INSTRUCTION_KEYWORDS].some((k) => line.toLowerCase().includes(k)))
    .join('\n')
}
