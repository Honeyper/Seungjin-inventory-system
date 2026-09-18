(function initializeHttpClient() {
  class RequestError extends Error {
    constructor(message, { status = 0, code = "request_failed" } = {}) {
      super(message);
      this.name = "RequestError";
      this.status = status;
      this.code = code;
    }
  }

  const temporaryStatuses = new Set([429, 502, 503, 504]);

  // Only reads may be retried: a lost write response does not mean the write failed.
  async function request(url, options = {}) {
    const { readOnly = false, timeoutMs = 45000, retryDelayMs = 300, ...init } = options;
    const attempts = readOnly ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        throw new RequestError("인터넷 연결을 확인해주세요.", { code: "offline" });
      }
      const controller = new AbortController();
      let timer;
      try {
        // Include reading the body in the deadline, not just receiving headers.
        return await Promise.race([
          (async () => {
            const response = await fetch(url, { ...init, signal: controller.signal });
            let result;
            try {
              result = await response.json();
            } catch (_error) {
              throw new RequestError("서버 응답을 읽지 못했습니다. 잠시 후 다시 확인해주세요.", {
                status: response.status, code: "invalid_response"
              });
            }
            if (!response.ok || !result || typeof result !== "object" || result.ok !== true) {
              throw new RequestError(typeof result?.message === "string" && result.message
                ? result.message : "요청을 처리하지 못했습니다. 잠시 후 다시 확인해주세요.", {
                status: response.status, code: "server_error"
              });
            }
            return result;
          })(),
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              reject(new RequestError(readOnly
                ? "조회 시간이 초과되었습니다. 다시 조회해주세요."
                : "서버 응답을 확인하지 못했습니다. 저장됐을 수 있으니 최신 내역을 확인해주세요.", { code: "timeout" }));
              controller.abort();
            }, timeoutMs);
          })
        ]);
      } catch (cause) {
        const error = cause instanceof RequestError ? cause : new RequestError(readOnly
          ? "서버에 연결하지 못했습니다. 인터넷 연결을 확인해주세요."
          : "서버 연결이 끊겼습니다. 저장됐을 수 있으니 최신 내역을 확인해주세요.", { code: "network" });
        const retryable = ["network", "timeout"].includes(error.code) || temporaryStatuses.has(error.status);
        if (attempt + 1 >= attempts || !retryable) throw error;
      } finally {
        clearTimeout(timer);
      }
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
  }

  window.SeungjinHttp = { request, RequestError };
})();
