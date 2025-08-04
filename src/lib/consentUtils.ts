export interface DataConsent {
  basic_profile: boolean;
  health_metrics: boolean;
  nutrition_data: boolean;
  weight_tracking: boolean;
  step_tracking: boolean;
  workout_activities: boolean;
  consent_version: string;
  updated_at: string;
}

/**
 * Check if user has consented to data collection
 * Returns true if any of the consent fields are true
 */
export function hasDataCollectionConsent(consentData: DataConsent | null): boolean {
  if (!consentData) return false;
  return (
    consentData.basic_profile ||
    consentData.health_metrics ||
    consentData.nutrition_data ||
    consentData.weight_tracking ||
    consentData.step_tracking ||
    consentData.workout_activities
  );
}

/**
 * Get consent status for onboarding flow
 */
export function getOnboardingConsentStatus(consentData: DataConsent | null): {
  hasDataCollectionConsent: boolean;
} {
  return {
    hasDataCollectionConsent: hasDataCollectionConsent(consentData),
  };
}

/**
 * Validate consent data structure
 */
export function validateConsentData(data: any): boolean {
  if (!data || typeof data !== 'object') return false;

  const requiredFields = [
    'basic_profile',
    'health_metrics',
    'nutrition_data',
    'weight_tracking',
    'step_tracking',
    'workout_activities',
  ];

  return requiredFields.every(field => typeof data[field] === 'boolean');
}

/**
 * Create default consent data
 */
export function createDefaultConsentData(): Partial<DataConsent> {
  return {
    basic_profile: true,
    health_metrics: false,
    nutrition_data: false,
    weight_tracking: false,
    step_tracking: false,
    workout_activities: false,
    consent_version: '1.0',
  };
}
