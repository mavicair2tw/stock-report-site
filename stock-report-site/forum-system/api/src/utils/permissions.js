export function limitsByRole(role) {
  switch (role) {
    case 'NEW_USER':
      return { postsPerDay: 3, linksPerPost: 1, canUploadImage: false };
    case 'VERIFIED_USER':
      return { postsPerDay: 10, linksPerPost: 3, canUploadImage: true };
    case 'TRUSTED_USER':
    case 'MODERATOR':
    case 'ADMIN':
      return { postsPerDay: Infinity, linksPerPost: Infinity, canUploadImage: true };
    default:
      return { postsPerDay: 0, linksPerPost: 0, canUploadImage: false };
  }
}

export function countLinks(text = '') {
  return (text.match(/https?:\/\/[^\s]+/g) || []).length;
}
