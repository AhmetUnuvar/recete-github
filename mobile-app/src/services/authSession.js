import AsyncStorage from "@react-native-async-storage/async-storage";

const SESSION_STORAGE_KEY = "@recete_auth_session";

/**
 * @returns {Promise<{ userId: string, email: string, token: string, activeAccountUserId: string, rememberMe: boolean } | null>}
 * activeAccountUserId: is verisi icin kullanilan user_id (calisan ise isveren, sahip ise kendi).
 */
export const loadAuthSession = async () => {
  try {
    const raw = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.rememberMe || !parsed?.userId) return null;
    return {
      userId: String(parsed.userId),
      email: String(parsed.email || ""),
      token: String(parsed.token || ""),
      activeAccountUserId: String(parsed.activeAccountUserId || parsed.userId),
      rememberMe: true
    };
  } catch {
    return null;
  }
};

export const saveAuthSession = async ({ userId, email, rememberMe, token, activeAccountUserId }) => {
  if (!rememberMe || !userId) {
    await clearAuthSession();
    return;
  }
  await AsyncStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      userId: String(userId),
      email: String(email || ""),
      token: token ? String(token) : "",
      activeAccountUserId: String(activeAccountUserId || userId),
      rememberMe: true
    })
  );
};

export const updateActiveAccountInSession = async (activeAccountUserId) => {
  try {
    const raw = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed?.rememberMe) return;
    parsed.activeAccountUserId = String(activeAccountUserId);
    await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    /* ignore */
  }
};

export const clearAuthSession = async () => {
  try {
    await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
};
