const { parseReviewBody } = require('../src/lib/reviewCase');

describe('parseReviewBody', () => {
  test('acepta action approve', () => {
    expect(parseReviewBody({ action: 'approve' })).toEqual({
      action: 'approve',
      feedback: '',
    });
  });

  test('acepta status approved (formato front)', () => {
    expect(parseReviewBody({ status: 'approved' })).toEqual({
      action: 'approve',
      feedback: '',
    });
  });

  test('acepta reviewStatus rejected con feedbackMessage', () => {
    expect(
      parseReviewBody({
        reviewStatus: 'rejected',
        feedbackMessage: 'Falta foto',
      })
    ).toEqual({ action: 'reject', feedback: 'Falta foto' });
  });

  test('reject sin feedback lanza 400', () => {
    expect(() => parseReviewBody({ status: 'rejected' })).toThrow(/feedback/i);
  });
});
