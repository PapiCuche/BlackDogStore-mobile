/**
 * MY OWN FILE IN THIS SHOP — CLIENT-SEC-01.
 *
 * The same profile the web's «Mi cuenta» edits, through the same service
 * (`customer_profile`): the same five fields, the same judge, the same refusals
 * in the same words.
 *
 * WHOSE PROFILE IS NEVER ASKED. The server reads it from the signed-in account
 * and the company in the path, and somebody who has never bought here gets the
 * 404 of the whole customer surface — so nobody can open a file on themselves
 * in a shop they have no relation with.
 */

/** `models.DocumentType`, defined once for the whole platform. */
export type CustomerDocumentType = 'dni' | 'ruc' | 'ce';

export const CUSTOMER_DOCUMENT_TYPES: readonly CustomerDocumentType[] = ['dni', 'ruc', 'ce'];

export function describeDocumentType(value: CustomerDocumentType): string {
  switch (value) {
    case 'dni':
      return 'DNI';
    case 'ruc':
      return 'RUC';
    case 'ce':
      return 'Carnet de Extranjería';
  }
}

export type CustomerProfile = {
  /** The account's address. Not editable here: it is what signs in. */
  email: string;
  /** ISO timestamp, or null while nobody has proved the address. */
  emailVerifiedAt: string | null;
  /** Whether a code can be sent right now. The server decides, not the app. */
  emailVerificationAvailable: boolean;
  firstName: string;
  lastName: string;
  phone: string;
  documentType: CustomerDocumentType | '';
  documentNumber: string;
  /**
   * The shop owns this document and the buyer cannot change it.
   *
   * The field is still shown — a person needs to read what is on file — but it
   * is not offered for editing, and the save would refuse it anyway.
   */
  documentLocked: boolean;
};

/** `Customer.first_name` / `last_name`. */
export const CUSTOMER_NAME_MAX_LENGTH = 120;
/** `Customer.phone`. */
export const CUSTOMER_PHONE_MAX_LENGTH = 30;
/** `Customer.document_number`. */
export const CUSTOMER_DOCUMENT_MAX_LENGTH = 20;

/**
 * WHAT EACH DOCUMENT LOOKS LIKE — `identity_validation.clean_document`.
 *
 * Mirrored to catch an obvious typo at the keyboard, never to decide. A RUC
 * also has a check digit the server verifies (module 11), and that arithmetic
 * stays on the server: a client that computed it would be a second authority
 * on which RUC exists.
 */
export const DOCUMENT_PATTERNS: Record<CustomerDocumentType, RegExp> = {
  dni: /^[0-9]{8}$/,
  ruc: /^[0-9]{11}$/,
  ce: /^[A-Za-z0-9]{6,12}$/,
};

/** What the server says when a shape is wrong, in its own words. */
export const DOCUMENT_SHAPE_MESSAGES: Record<CustomerDocumentType, string> = {
  dni: 'El DNI debe tener exactamente 8 dígitos.',
  ruc: 'El RUC debe tener exactamente 11 dígitos.',
  ce: 'El Carnet de Extranjería debe tener entre 6 y 12 caracteres alfanuméricos.',
};

/**
 * A Peruvian mobile, as `serializers._PERU_PHONE_RE` accepts it.
 *
 * The country code is optional and so is its `+`, which is how the same number
 * arrives written three ways — `987654321`, `+51987654321`, `51 987 654 321`.
 * Spaces are stripped before matching because a number pasted from a web page
 * carries no-break ones and the server takes it.
 */
const PHONE_PATTERN = /^(\+?51?)?9[0-9]{8}$/;

export function isPlausibleCustomerPhone(raw: string): boolean {
  const compact = raw.replace(/\s/g, '');
  return compact.length === 0 || PHONE_PATTERN.test(compact);
}

export const PHONE_SHAPE_MESSAGE =
  'Teléfono inválido. Ejemplos aceptados: 987654321, +51987654321, +51 987 654 321.';

/** What a save sends. Only the fields the person touched. */
export type CustomerProfileInput = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  /** Both or neither: a number without its type cannot be judged. */
  documentType?: CustomerDocumentType | '';
  documentNumber?: string;
};

/** The answer to «send me a code», which may say there is nothing to prove. */
export type EmailCodeRequest = {
  detail: string;
  alreadyVerified: boolean;
  emailVerifiedAt: string | null;
};
