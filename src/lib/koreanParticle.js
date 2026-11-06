export const withGwaWa = (word) => {
    const last = String(word || '').trim().charCodeAt(String(word || '').trim().length - 1);
    return !(last >= 0xAC00 && last <= 0xD7A3) || (last - 0xAC00) % 28 !== 0 ? '과' : '와';
};
