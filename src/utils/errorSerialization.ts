import { redactSensitiveString } from './securityRedaction';

const stringifyFallback = (value: unknown): string => {
  try {
    return String(value);
  } catch {
    return '[Unserializable value]';
  }
};

const safeStringify = (value: unknown): string => {
  try {
    const serialized = JSON.stringify(value);
    return serialized ?? stringifyFallback(value);
  } catch {
    return stringifyFallback(value);
  }
};

export const serializeStartupError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: redactSensitiveString(error.name),
      message: redactSensitiveString(error.message),
      stack: error.stack ? redactSensitiveString(error.stack) : null,
    };
  }

  return {
    name: 'NonError',
    message: redactSensitiveString(
      typeof error === 'string'
        ? error
        : safeStringify(error),
    ),
    stack: null,
  };
};
