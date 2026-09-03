(function initializeSeungjinQrPayload(globalScope) {
  const CHECKSUM_SEPARATOR = "~";
  const CHECKSUM_LENGTH = 6;

  function normalizeBoxId(value) {
    return String(value || "").trim();
  }

  function getChecksum(boxId) {
    const normalizedBoxId = normalizeBoxId(boxId);
    let hash = 0x811c9dc5;

    for (let index = 0; index < normalizedBoxId.length; index += 1) {
      hash ^= normalizedBoxId.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }

    return (hash >>> 0)
      .toString(16)
      .toUpperCase()
      .padStart(8, "0")
      .slice(-CHECKSUM_LENGTH);
  }

  function create(boxId) {
    const normalizedBoxId = normalizeBoxId(boxId);
    if (!normalizedBoxId) {
      return "";
    }

    return `${normalizedBoxId}${CHECKSUM_SEPARATOR}${getChecksum(normalizedBoxId)}`;
  }

  function parse(value) {
    const normalizedValue = String(value || "").trim();
    const separatorIndex = normalizedValue.lastIndexOf(CHECKSUM_SEPARATOR);
    if (separatorIndex < 0) {
      return {
        boxId: normalizedValue,
        hasChecksum: false,
        isValid: Boolean(normalizedValue)
      };
    }

    const boxId = normalizeBoxId(normalizedValue.slice(0, separatorIndex));
    const checksum = normalizedValue.slice(separatorIndex + CHECKSUM_SEPARATOR.length).toUpperCase();
    const hasValidFormat = new RegExp(`^[0-9A-F]{${CHECKSUM_LENGTH}}$`).test(checksum);

    return {
      boxId,
      hasChecksum: true,
      isValid: Boolean(boxId) && hasValidFormat && checksum === getChecksum(boxId)
    };
  }

  globalScope.SeungjinQrPayload = Object.freeze({
    create,
    getChecksum,
    parse
  });
}(globalThis));
