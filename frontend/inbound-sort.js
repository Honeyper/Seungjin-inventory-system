(function initializeSeungjinInboundSort(globalScope) {
  const textCollator = new Intl.Collator("ko", {
    numeric: true,
    sensitivity: "base"
  });

  const textColumns = {
    2: "clientName",
    3: "inboundType",
    4: "productName",
    5: "batch",
    6: "purchaseOrderRound",
    7: "process",
    16: "registrant"
  };
  const numericColumns = {
    8: "boxQuantity",
    9: "inboundBoxCount",
    10: "remainQuantity",
    11: "inboundTotalQuantity",
    12: "boxTotalCount",
    13: "inspectionQuantity",
    14: "defectQuantity",
    15: "defectRate"
  };

  function parseInboundTimestamp(inbound) {
    const dateParts = String(inbound?.inboundDate || "").match(/\d+/g)?.map(Number) || [];
    if (dateParts.length < 3) {
      return null;
    }

    const timeParts = String(inbound?.inboundTime || "").match(/\d+/g)?.map(Number) || [];
    return Date.UTC(
      dateParts[0],
      dateParts[1] - 1,
      dateParts[2],
      timeParts[0] || 0,
      timeParts[1] || 0,
      timeParts[2] || 0
    );
  }

  function parseNumericValue(value) {
    const matched = String(value ?? "").replaceAll(",", "").match(/-?\d+(?:\.\d+)?/);
    return matched ? Number(matched[0]) : null;
  }

  function getColumnValue(inbound, column) {
    if (column === 1) {
      return parseInboundTimestamp(inbound);
    }
    if (numericColumns[column]) {
      return parseNumericValue(inbound?.[numericColumns[column]]);
    }

    const value = String(inbound?.[textColumns[column]] || "").trim();
    return value && value !== "-" ? value : null;
  }

  function compareValues(leftValue, rightValue, direction) {
    const leftMissing = leftValue === null;
    const rightMissing = rightValue === null;

    if (leftMissing || rightMissing) {
      if (leftMissing === rightMissing) return 0;
      return leftMissing ? 1 : -1;
    }

    const compared = typeof leftValue === "number" && typeof rightValue === "number"
      ? leftValue - rightValue
      : textCollator.compare(String(leftValue), String(rightValue));
    return direction === "desc" ? -compared : compared;
  }

  function sortInbounds(inbounds, column = 1, direction = "desc") {
    return [...inbounds]
      .map((inbound, originalIndex) => ({ inbound, originalIndex }))
      .sort((left, right) => {
        const compared = compareValues(
          getColumnValue(left.inbound, column),
          getColumnValue(right.inbound, column),
          direction
        );

        if (compared) return compared;

        if (column !== 1) {
          const recentFirst = compareValues(
            parseInboundTimestamp(left.inbound),
            parseInboundTimestamp(right.inbound),
            "desc"
          );
          if (recentFirst) return recentFirst;
        }

        return left.originalIndex - right.originalIndex;
      })
      .map(({ inbound }) => inbound);
  }

  globalScope.SeungjinInboundSort = Object.freeze({
    getColumnValue,
    parseInboundTimestamp,
    parseNumericValue,
    sortInbounds
  });
}(globalThis));
