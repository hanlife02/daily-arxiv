type ApiRouteHandler<Args extends unknown[]> = (...args: Args) => Response | Promise<Response>;

function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

export function withApiErrorHandling<Args extends unknown[]>(handler: ApiRouteHandler<Args>) {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (isResponse(error)) return error;
      throw error;
    }
  };
}
