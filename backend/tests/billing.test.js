describe('billing math', () => {
  const roundUsd = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const creditFromPayment = (paidUsd) => roundUsd(paidUsd * 0.5);
  const chargeForCredit = (creditUsd) => roundUsd(creditUsd / 0.5);
  const applyMarkup = (infraUsd) => {
    const billed = infraUsd * 1.25;
    return {
      infraUsd: roundUsd(infraUsd),
      markupUsd: roundUsd(billed - infraUsd),
      billedUsd: roundUsd(billed),
    };
  };

  it('credits 50% of the amount the user paid', () => {
    expect(creditFromPayment(100)).toBe(50);
    expect(chargeForCredit(50)).toBe(100);
    expect(chargeForCredit(25)).toBe(50);
  });

  it('adds 25% markup to infrastructure cost', () => {
    const { infraUsd, markupUsd, billedUsd } = applyMarkup(5);
    expect(infraUsd).toBe(5);
    expect(markupUsd).toBe(1.25);
    expect(billedUsd).toBe(6.25);
  });

  it('converts cents without fractional drift', () => {
    expect(Math.round(6.25 * 100)).toBe(625);
    expect(625 / 100).toBe(6.25);
  });
});
