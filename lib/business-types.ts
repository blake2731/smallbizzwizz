export interface BusinessTypeOption {
  value: string
  label: string
}

export const BUSINESS_TYPE_OPTIONS: BusinessTypeOption[] = [
  { value: 'retail', label: 'Retail / boutique' },
  { value: 'restaurant', label: 'Restaurant / food service' },
  { value: 'freelancer', label: 'Freelancer / solo professional' },
  { value: 'contractor', label: 'Contractor / trades' },
  { value: 'ecommerce', label: 'E-commerce' },
  { value: 'service', label: 'Service business / agency' },
  { value: 'other', label: 'Other' },
]
