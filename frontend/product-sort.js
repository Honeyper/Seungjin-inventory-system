(function initializeSeungjinProductSort(globalScope) {
  const nameCollator = new Intl.Collator("ko", {
    numeric: true,
    sensitivity: "base"
  });

  function parseRegisteredTimestamp(product) {
    const dateText = String(product?.registeredAt || "").trim();
    const dateParts = dateText.match(/\d+/g)?.map(Number) || [];

    if (dateParts.length < 3) {
      return Number.NEGATIVE_INFINITY;
    }

    const timeText = String(product?.registeredTime || "").trim();
    const timeParts = timeText.match(/\d+/g)?.map(Number) || [];
    let hours = timeParts[0] || 0;
    const minutes = timeParts[1] || 0;

    if (timeText.includes("오후") && hours < 12) {
      hours += 12;
    } else if (timeText.includes("오전") && hours === 12) {
      hours = 0;
    }

    return Date.UTC(
      dateParts[0],
      dateParts[1] - 1,
      dateParts[2],
      hours,
      minutes
    );
  }

  function parseQuantity(value) {
    const matched = String(value ?? "").match(/\d[\d,]*/);
    return matched ? Number(matched[0].replaceAll(",", "")) : 0;
  }

  function compareRegistered(left, right) {
    return parseRegisteredTimestamp(left) - parseRegisteredTimestamp(right);
  }

  function compareNames(left, right) {
    return nameCollator.compare(
      String(left?.productName || ""),
      String(right?.productName || "")
    ) || nameCollator.compare(
      String(left?.clientName || ""),
      String(right?.clientName || "")
    ) || nameCollator.compare(
      String(left?.productCode || left?.productId || ""),
      String(right?.productCode || right?.productId || "")
    );
  }

  function sortProducts(products, sortKey = "registered") {
    return [...products]
      .map((product, originalIndex) => ({ product, originalIndex }))
      .sort((left, right) => {
        let compared = 0;

        if (sortKey === "name") {
          compared = compareNames(left.product, right.product);
        } else if (sortKey === "inboundQuantity") {
          compared = parseQuantity(right.product?.accumulatedInboundQuantity)
            - parseQuantity(left.product?.accumulatedInboundQuantity);
          compared ||= compareRegistered(left.product, right.product);
        } else {
          compared = compareRegistered(left.product, right.product);
        }

        return compared || left.originalIndex - right.originalIndex;
      })
      .map(({ product }) => product);
  }

  globalScope.SeungjinProductSort = Object.freeze({
    parseRegisteredTimestamp,
    parseQuantity,
    sortProducts
  });
}(globalThis));
