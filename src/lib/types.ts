export interface MedicationInfo {
  name: string
  strength: string
  frequency: string
  duration: string
  instructions: string
}

export interface PatientInfo {
  name: string
  dateOfBirth: string
  patientId: string
}

export interface DoctorInfo {
  name: string
  licenseNumber: string
}

export interface ProcessedPrescription {
  rawText: string
  medication: MedicationInfo[]
  patientInfo: PatientInfo
  doctorInfo: DoctorInfo
  date: string
  instructions: string
}

export interface Medicine {
  name: string
  brandNames: string[]
  category: string
  dosage: string
  description: string
  generic: string
  dosageOptions: string[]
}

export interface MatchedMedicine {
  medicine: Medicine
  confidence: number
}
