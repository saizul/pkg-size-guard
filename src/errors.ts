/** A problem with the configuration, the command line or the environment (exit code 2). */
export class GuardError extends Error {
  override name = 'GuardError';
}
