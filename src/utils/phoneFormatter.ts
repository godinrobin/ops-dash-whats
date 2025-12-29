/**
 * Centralized phone number formatting utilities
 * Supports international numbers with special handling for Brazilian format
 */

// Valid Brazilian DDDs (area codes)
const validBrazilianDDDs = [
  '11', '12', '13', '14', '15', '16', '17', '18', '19', // São Paulo
  '21', '22', '24', // Rio de Janeiro
  '27', '28', // Espírito Santo
  '31', '32', '33', '34', '35', '37', '38', // Minas Gerais
  '41', '42', '43', '44', '45', '46', // Paraná
  '47', '48', '49', // Santa Catarina
  '51', '53', '54', '55', // Rio Grande do Sul
  '61', // Distrito Federal
  '62', '64', // Goiás
  '63', // Tocantins
  '65', '66', // Mato Grosso
  '67', // Mato Grosso do Sul
  '68', // Acre
  '69', // Rondônia
  '71', '73', '74', '75', '77', // Bahia
  '79', // Sergipe
  '81', '87', // Pernambuco
  '82', // Alagoas
  '83', // Paraíba
  '84', // Rio Grande do Norte
  '85', '88', // Ceará
  '86', '89', // Piauí
  '91', '93', '94', // Pará
  '92', '97', // Amazonas
  '95', // Roraima
  '96', // Amapá
  '98', '99', // Maranhão
];

/**
 * Format phone number for display - supports international numbers
 * Examples:
 * - Brazilian with country code: 5527998635940 → +55 (27) 99863-5940
 * - Brazilian without country code: 27998635940 → +55 (27) 99863-5940
 * - International: 14155551234 → +1 415 555 1234
 */
export const formatPhoneDisplay = (phone: string): string => {
  if (!phone) return '';
  
  const cleaned = phone.replace(/\D/g, '');
  
  if (!cleaned) return phone;
  
  // Brazilian number with country code (55 + DDD + number = 12-13 digits)
  if (cleaned.startsWith('55') && cleaned.length >= 12 && cleaned.length <= 13) {
    const ddd = cleaned.slice(2, 4);
    let localNumber = cleaned.slice(4);
    
    // If local number has 8 digits, add 9 at the beginning for mobile
    if (localNumber.length === 8) {
      localNumber = '9' + localNumber;
    }
    
    // Format as +55 (XX) XXXXX-XXXX
    if (localNumber.length === 9) {
      return `+55 (${ddd}) ${localNumber.slice(0, 5)}-${localNumber.slice(5)}`;
    }
    
    // Fallback for 8-digit landlines
    if (localNumber.length === 8) {
      return `+55 (${ddd}) ${localNumber.slice(0, 4)}-${localNumber.slice(4)}`;
    }
    
    return `+55 (${ddd}) ${localNumber}`;
  }
  
  // Brazilian number WITHOUT country code (10-11 digits starting with valid DDD)
  if (cleaned.length >= 10 && cleaned.length <= 11) {
    const possibleDDD = cleaned.slice(0, 2);
    if (validBrazilianDDDs.includes(possibleDDD)) {
      let localNumber = cleaned.slice(2);
      
      // If local number has 8 digits, add 9 at the beginning for mobile
      if (localNumber.length === 8) {
        localNumber = '9' + localNumber;
      }
      
      // Format as +55 (XX) XXXXX-XXXX
      if (localNumber.length === 9) {
        return `+55 (${possibleDDD}) ${localNumber.slice(0, 5)}-${localNumber.slice(5)}`;
      }
      
      // Fallback for 8-digit landlines
      if (localNumber.length === 8) {
        return `+55 (${possibleDDD}) ${localNumber.slice(0, 4)}-${localNumber.slice(4)}`;
      }
      
      return `+55 (${possibleDDD}) ${localNumber}`;
    }
  }
  
  // International numbers - format with readable groupings
  if (cleaned.length >= 10 && cleaned.length <= 15) {
    // Try to identify country code and format accordingly
    // US/Canada (+1)
    if (cleaned.startsWith('1') && cleaned.length === 11) {
      return `+1 ${cleaned.slice(1, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
    }
    
    // Generic international format: +XX XXX XXX XXXX
    if (cleaned.length >= 10) {
      // Assume 2-digit country code for most cases
      const countryCode = cleaned.slice(0, 2);
      const rest = cleaned.slice(2);
      
      if (rest.length >= 8) {
        // Split into groups of 3-3-4 or similar
        const groups = [];
        let remaining = rest;
        while (remaining.length > 0) {
          if (remaining.length <= 4) {
            groups.push(remaining);
            remaining = '';
          } else {
            groups.push(remaining.slice(0, 3));
            remaining = remaining.slice(3);
          }
        }
        return `+${countryCode} ${groups.join(' ')}`;
      }
      
      return `+${countryCode} ${rest}`;
    }
  }
  
  // Short numbers - just add + prefix
  if (cleaned.length > 0) {
    return `+${cleaned}`;
  }
  
  return phone;
};

/**
 * Format phone number for input fields with live formatting
 * Used for form inputs - allows up to 15 digits (E.164 max)
 */
export const formatPhoneNumber = (value: string): string => {
  // Remove all non-digits
  const numbers = value.replace(/\D/g, '');
  
  // Limit to 15 digits (E.164 max length)
  const limited = numbers.slice(0, 15);
  
  // For Brazilian-style input, format as (XX) XXXXX-XXXX
  if (limited.length <= 2) {
    return limited;
  } else if (limited.length <= 3) {
    return `(${limited.slice(0, 2)}) ${limited.slice(2)}`;
  } else if (limited.length <= 7) {
    return `(${limited.slice(0, 2)}) ${limited.slice(2)}`;
  } else if (limited.length <= 10) {
    // Landline format: (31) 9828-4929
    return `(${limited.slice(0, 2)}) ${limited.slice(2, 6)}-${limited.slice(6)}`;
  } else if (limited.length <= 11) {
    // Mobile format: (31) 99828-4929
    return `(${limited.slice(0, 2)}) ${limited.slice(2, 7)}-${limited.slice(7)}`;
  } else {
    // International with country code: +55 (31) 99828-4929
    const countryCode = limited.slice(0, 2);
    const ddd = limited.slice(2, 4);
    const rest = limited.slice(4);
    
    if (rest.length <= 4) {
      return `+${countryCode} (${ddd}) ${rest}`;
    } else if (rest.length <= 8) {
      return `+${countryCode} (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
    } else {
      return `+${countryCode} (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    }
  }
};

/**
 * Remove all formatting from phone number, keeping only digits
 */
export const unformatPhoneNumber = (value: string): string => {
  return value.replace(/\D/g, '');
};

/**
 * Normalize phone number to E.164 format (just digits)
 * Ensures Brazilian numbers have country code
 */
export const normalizePhoneNumber = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '');
  
  // If it's a Brazilian number without country code, add it
  if (cleaned.length >= 10 && cleaned.length <= 11) {
    const possibleDDD = cleaned.slice(0, 2);
    if (validBrazilianDDDs.includes(possibleDDD)) {
      return '55' + cleaned;
    }
  }
  
  return cleaned;
};
