import React, { useState, useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import AuthLayout from "./src/components/AuthLayout";
import SidebarLayout from "./src/components/SidebarLayout";
import LoginScreen from "./src/screens/LoginScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import ForgotPasswordScreen from "./src/screens/ForgotPasswordScreen";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import HomeScreen from "./src/screens/HomeScreen";
import AddProductScreen from "./src/screens/AddProductScreen";
import MyProductsScreen from "./src/screens/MyProductsScreen";
import MyOwnedProductsScreen from "./src/screens/MyOwnedProductsScreen";
import RetailBuyScreen from "./src/screens/RetailBuyScreen";
import MyRetailProductsScreen from "./src/screens/MyRetailProductsScreen";
import StockOperationsScreen from "./src/screens/StockOperationsScreen";
import MyStocksScreen from "./src/screens/MyStocksScreen";
import DebtsReceivablesScreen from "./src/screens/DebtsReceivablesScreen";
import ProfitSummaryScreen from "./src/screens/ProfitSummaryScreen";
import FixedIncomeExpenseScreen from "./src/screens/FixedIncomeExpenseScreen";
import CustomersScreen from "./src/screens/CustomersScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import AddSharedUserScreen from "./src/screens/AddSharedUserScreen";
import EarningsSummaryScreen from "./src/screens/EarningsSummaryScreen";
import {
  loginUser,
  registerUser,
  sendRegistrationCode,
  verifyRegistrationCode,
  sendForgotPasswordCode,
  verifyPasswordResetCode,
  completePasswordReset,
  resolveWorkspaceUserId
} from "./src/services/authService";
import {
  loadAuthSession,
  saveAuthSession,
  clearAuthSession
} from "./src/services/authSession";
import { setAuthToken } from "./src/services/apiClient";
import { COLORS } from "./src/constants/colors";
import { API_BASE_URL } from "./src/constants/config";

/** Cihazda bir kez yazilir; silinince (kaldirma / veri silme) tanitim yeniden gosterilir. App Store "indirme" sunucuda tutulmaz. */
const ONBOARDING_STORAGE_KEY = "@recete_onboarding_completed";

/**
 * Expo / gelistirme: Animasyonlari tekrar gormek icin `true` yap, kaydet, uygulamayi yenile (Metro’dan `r`).
 * Isin bitince `false` yap (yoksa her acilista tanitim gelir — sadece __DEV__ iken etkili).
 */
const DEV_FORCE_SHOW_ONBOARDING = false;

const emptyForm = {
  name: "",
  lastname: "",
  email: "",
  phone_number: "",
  password: ""
};

export default function App() {
  const [bootstrapPhase, setBootstrapPhase] = useState("loading");
  const [screen, setScreen] = useState("login"); // login | register | forgot
  const [appPage, setAppPage] = useState("home");
  const [stocksRefreshNonce, setStocksRefreshNonce] = useState(0);
  const [ownedProductsRefreshNonce, setOwnedProductsRefreshNonce] = useState(0);
  const [retailProductsRefreshNonce, setRetailProductsRefreshNonce] = useState(0);
  const [transactionsRefreshNonce, setTransactionsRefreshNonce] = useState(0);
  const [homeFocusNonce, setHomeFocusNonce] = useState(0);
  const [addProductFocusNonce, setAddProductFocusNonce] = useState(0);
  const [customersFocusNonce, setCustomersFocusNonce] = useState(0);
  const [fixedIncomeExpenseFocusNonce, setFixedIncomeExpenseFocusNonce] = useState(0);
  const [profitSummaryFocusNonce, setProfitSummaryFocusNonce] = useState(0);
  const [stockOpsFocusNonce, setStockOpsFocusNonce] = useState(0);
  const [myStocksFocusNonce, setMyStocksFocusNonce] = useState(0);
  const [myProductsFocusNonce, setMyProductsFocusNonce] = useState(0);
  const [loggedInUserId, setLoggedInUserId] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [keepLoggedIn, setKeepLoggedIn] = useState(true);
  const [registerForm, setRegisterForm] = useState(emptyForm);
  const [verificationCode, setVerificationCode] = useState("");
  const [registerCodeHint, setRegisterCodeHint] = useState("");
  const [sendCodeLoading, setSendCodeLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState("");
  const [forgotCodeHint, setForgotCodeHint] = useState("");
  const [forgotSendLoading, setForgotSendLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (__DEV__ && DEV_FORCE_SHOW_ONBOARDING) {
          await AsyncStorage.removeItem(ONBOARDING_STORAGE_KEY);
        }
        const stored = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
        if (!alive) return;

        if (stored !== "1") {
          setBootstrapPhase("onboarding");
          return;
        }

        const session = await loadAuthSession();
        if (!alive) return;
        if (session?.userId) {
          setLoggedInUserId(session.userId);
          if (session.token) setAuthToken(session.token);
          const workspaceUserId = await resolveWorkspaceUserId(session.userId);
          if (!alive) return;
          setCurrentUserId(workspaceUserId);
          setLoginData((prev) => ({
            ...prev,
            email: session.email || prev.email,
            password: ""
          }));
          setKeepLoggedIn(true);
          setScreen("home");
        }
        setBootstrapPhase("ready");
      } catch {
        if (!alive) return;
        setBootstrapPhase("onboarding");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const completeOnboarding = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
    } catch {
      /* anahtar yazilamazsa yine de giris akisina geç */
    }
    setBootstrapPhase("ready");
  };

  const handleRegisterChange = (field, value) => {
    setRegisterForm((prev) => ({ ...prev, [field]: value }));
  };

  const onLoginPress = async () => {
    const { email, password } = loginData;
    if (!email || !password) {
      setLoginMessage("E-posta ve sifre zorunlu.");
      return;
    }

    try {
      setLoading(true);
      setLoginMessage("");
      const loginResult = await loginUser(loginData);
      const userId = loginResult.user_id || null;
      const token = loginResult.token || "";
      const emailNorm = String(email || "").trim();
      setAuthToken(token);
      setLoggedInUserId(userId);
      const workspaceUserId = await resolveWorkspaceUserId(userId);
      setCurrentUserId(workspaceUserId);
      setLoginData((prev) => ({ ...prev, email: emailNorm, password: "" }));
      await saveAuthSession({
        userId,
        email: loginResult.email || emailNorm,
        token,
        activeAccountUserId: workspaceUserId,
        rememberMe: keepLoggedIn
      });
      setScreen("home");
    } catch (error) {
      setLoginMessage(error.message || "Giris yapilamadi.");
    } finally {
      setLoading(false);
    }
  };

  const onSendRegistrationCode = async () => {
    const email = String(registerForm.email || "").trim();
    if (!email) {
      setMessage("Once e-posta adresini yaz.");
      setRegisterCodeHint("");
      return;
    }
    try {
      setSendCodeLoading(true);
      setMessage("");
      setRegisterCodeHint("");
      await sendRegistrationCode({ email });
      setRegisterCodeHint("Dogrulama kodu e-postana gonderildi. Gelen kutunu kontrol et.");
    } catch (error) {
      setMessage(error.message || "Kod gonderilemedi.");
      setRegisterCodeHint("");
    } finally {
      setSendCodeLoading(false);
    }
  };

  const onRegisterPress = async () => {
    const { name, lastname, email, phone_number, password } = registerForm;
    if (!name || !lastname || !email || !phone_number || !password) {
      setMessage("Tum alanlari doldurman gerekiyor.");
      return;
    }
    const code = String(verificationCode || "").trim();
    if (code.length !== 6) {
      setMessage("6 haneli dogrulama kodunu gir.");
      return;
    }

    try {
      setLoading(true);
      setMessage("");
      const { registration_token: registrationToken } = await verifyRegistrationCode({
        email: String(email).trim(),
        code
      });
      await registerUser({
        ...registerForm,
        email: String(email).trim(),
        registration_token: registrationToken
      });
      setLoginMessage("Hesap basariyla olusturuldu. Simdi giris yapabilirsin.");
      setRegisterForm(emptyForm);
      setVerificationCode("");
      setRegisterCodeHint("");
      setScreen("login");
    } catch (error) {
      setMessage(error.message || "Sunucuya baglanilamadi.");
    } finally {
      setLoading(false);
    }
  };

  const resetForgotForm = () => {
    setForgotEmail("");
    setForgotCode("");
    setForgotNewPassword("");
    setForgotConfirmPassword("");
    setForgotCodeHint("");
    setForgotMessage("");
  };

  const onSendForgotPasswordCode = async () => {
    const email = String(forgotEmail || "").trim();
    if (!email) {
      setForgotMessage("E-posta adresini yaz.");
      setForgotCodeHint("");
      return;
    }
    try {
      setForgotSendLoading(true);
      setForgotMessage("");
      setForgotCodeHint("");
      await sendForgotPasswordCode({ email });
      setForgotCodeHint("Dogrulama kodu e-postana gonderildi. Gelen kutunu kontrol et.");
    } catch (error) {
      setForgotMessage(error.message || "Kod gonderilemedi.");
      setForgotCodeHint("");
    } finally {
      setForgotSendLoading(false);
    }
  };

  const onForgotPasswordSubmit = async () => {
    const email = String(forgotEmail || "").trim();
    const code = String(forgotCode || "").trim();
    const pw = String(forgotNewPassword || "");
    const pw2 = String(forgotConfirmPassword || "");

    if (!email) {
      setForgotMessage("E-posta zorunlu.");
      return;
    }
    if (code.length !== 6) {
      setForgotMessage("6 haneli dogrulama kodunu gir.");
      return;
    }
    if (pw.length < 6) {
      setForgotMessage("Yeni sifre en az 6 karakter olmali.");
      return;
    }
    if (pw !== pw2) {
      setForgotMessage("Sifreler eslesmiyor.");
      return;
    }

    try {
      setLoading(true);
      setForgotMessage("");
      const { reset_token: resetToken } = await verifyPasswordResetCode({ email, code });
      await completePasswordReset({ email, reset_token: resetToken, new_password: pw });
      setLoginData((prev) => ({ ...prev, email, password: "" }));
      setLoginMessage("Sifren guncellendi. Yeni sifrenle giris yapabilirsin.");
      resetForgotForm();
      setScreen("login");
    } catch (error) {
      setForgotMessage(error.message || "Islem basarisiz.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await clearAuthSession();
    setAuthToken(null);
    setLoginData({ email: "", password: "" });
    setKeepLoggedIn(true);
    setLoggedInUserId(null);
    setCurrentUserId(null);
    setLoginMessage("");
    setAppPage("home");
    setStocksRefreshNonce(0);
    setOwnedProductsRefreshNonce(0);
    setTransactionsRefreshNonce(0);
    setHomeFocusNonce(0);
    setAddProductFocusNonce(0);
    setCustomersFocusNonce(0);
    setFixedIncomeExpenseFocusNonce(0);
    setProfitSummaryFocusNonce(0);
    setStockOpsFocusNonce(0);
    setMyStocksFocusNonce(0);
    setMyProductsFocusNonce(0);
    setScreen("login");
  };

  if (bootstrapPhase === "loading") {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: COLORS.background
        }}
      >
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (bootstrapPhase === "onboarding") {
    return <OnboardingScreen onComplete={completeOnboarding} />;
  }

  if (screen === "home") {
    const isBusinessOwner =
      loggedInUserId && currentUserId && String(loggedInUserId) === String(currentUserId);

    return (
      <SidebarLayout
        activeKey={appPage}
        showEmployeeManagement={isBusinessOwner}
        onSelect={(key) => {
          if (key === "add-shared-user" && !isBusinessOwner) return;
          if (key === "logout") {
            handleLogout();
            return;
          }
          setAppPage(key);
          if (key === "home") {
            setHomeFocusNonce((n) => n + 1);
          }
          if (key === "add-product") {
            setAddProductFocusNonce((n) => n + 1);
          }
          if (key === "customers") {
            setCustomersFocusNonce((n) => n + 1);
          }
          if (key === "fixed-income-expense") {
            setFixedIncomeExpenseFocusNonce((n) => n + 1);
          }
          if (key === "profit-summary") {
            setProfitSummaryFocusNonce((n) => n + 1);
          }
          if (key === "stock-ops") {
            setStockOpsFocusNonce((n) => n + 1);
          }
          if (key === "my-stocks") {
            setMyStocksFocusNonce((n) => n + 1);
          }
          if (key === "my-products") {
            setMyProductsFocusNonce((n) => n + 1);
          }
          if (key === "my-retail-products") {
            setRetailProductsRefreshNonce((n) => n + 1);
          }
        }}
      >
        {appPage === "home" && (
          <HomeScreen
            userId={currentUserId}
            transactionsRefreshNonce={transactionsRefreshNonce}
            homeFocusNonce={homeFocusNonce}
            onTransactionsMutated={() => setTransactionsRefreshNonce((n) => n + 1)}
          />
        )}
        {appPage === "add-product" && (
          <AddProductScreen
            userId={currentUserId}
            onGoToStockAdd={() => {
              setAppPage("stock-ops");
              setStockOpsFocusNonce((n) => n + 1);
            }}
            addProductFocusNonce={addProductFocusNonce}
          />
        )}
        {appPage === "my-products" && (
          <MyProductsScreen
            userId={currentUserId}
            myProductsFocusNonce={myProductsFocusNonce}
            onStocksAffected={() => setStocksRefreshNonce((n) => n + 1)}
            onOwnedProductsAffected={() => setOwnedProductsRefreshNonce((n) => n + 1)}
            onAddRecipe={() => {
              setAppPage("add-product");
              setAddProductFocusNonce((n) => n + 1);
            }}
          />
        )}
        {appPage === "my-owned-products" && (
          <MyOwnedProductsScreen
            userId={currentUserId}
            refreshNonce={ownedProductsRefreshNonce}
            onGoToRecipes={() => {
              setAppPage("my-products");
              setMyProductsFocusNonce((n) => n + 1);
            }}
          />
        )}
        {appPage === "retail-buy" && (
          <RetailBuyScreen
            userId={currentUserId}
            onSaved={() => {
              setRetailProductsRefreshNonce((n) => n + 1);
              setTransactionsRefreshNonce((n) => n + 1);
            }}
          />
        )}
        {appPage === "my-retail-products" && (
          <MyRetailProductsScreen
            userId={currentUserId}
            refreshNonce={retailProductsRefreshNonce}
            onTransactionsMutated={() => setTransactionsRefreshNonce((n) => n + 1)}
          />
        )}
        {appPage === "stock-ops" && (
          <StockOperationsScreen userId={currentUserId} stockOpsFocusNonce={stockOpsFocusNonce} />
        )}
        {appPage === "my-stocks" && (
          <MyStocksScreen
            userId={currentUserId}
            stocksRefreshNonce={stocksRefreshNonce}
            myStocksFocusNonce={myStocksFocusNonce}
            onGoToStockAdd={() => {
              setAppPage("stock-ops");
              setStockOpsFocusNonce((n) => n + 1);
            }}
          />
        )}
        {appPage === "debts-receivables" && (
          <DebtsReceivablesScreen
            userId={currentUserId}
            onTransactionsMutated={() => setTransactionsRefreshNonce((n) => n + 1)}
          />
        )}
        {appPage === "earnings-summary" && (
          <EarningsSummaryScreen
            userId={currentUserId}
            onTransactionsMutated={() => setTransactionsRefreshNonce((n) => n + 1)}
          />
        )}
        {appPage === "profit-summary" && (
          <ProfitSummaryScreen
            userId={currentUserId}
            profitSummaryFocusNonce={profitSummaryFocusNonce}
            onGoToAddFixedIncomeExpense={() => {
              setAppPage("fixed-income-expense");
              setFixedIncomeExpenseFocusNonce((n) => n + 1);
            }}
          />
        )}
        {appPage === "fixed-income-expense" && (
          <FixedIncomeExpenseScreen
            userId={currentUserId}
            fixedIncomeExpenseFocusNonce={fixedIncomeExpenseFocusNonce}
          />
        )}
        {appPage === "customers" && (
          <CustomersScreen
            userId={currentUserId}
            customersFocusNonce={customersFocusNonce}
            onTransactionsMutated={() => setTransactionsRefreshNonce((n) => n + 1)}
          />
        )}
        {appPage === "add-shared-user" && isBusinessOwner && (
          <AddSharedUserScreen ownerUserId={loggedInUserId} />
        )}
        {appPage === "profile" && (
          <ProfileScreen
            email={loginData.email}
            userId={loggedInUserId}
            isBusinessOwner={isBusinessOwner}
            onLogout={handleLogout}
          />
        )}
      </SidebarLayout>
    );
  }

  return (
    <AuthLayout>
      {screen === "login" ? (
        <LoginScreen
          email={loginData.email}
          password={loginData.password}
          message={loginMessage}
          loading={loading}
          keepLoggedIn={keepLoggedIn}
          onChangeKeepLoggedIn={setKeepLoggedIn}
          onChangeEmail={(value) => setLoginData((prev) => ({ ...prev, email: value }))}
          onChangePassword={(value) => setLoginData((prev) => ({ ...prev, password: value }))}
          onSubmit={onLoginPress}
          onGoRegister={() => {
            setLoginMessage("");
            setMessage("");
            setRegisterCodeHint("");
            setVerificationCode("");
            setScreen("register");
          }}
          onForgotPassword={() => {
            setLoginMessage("");
            setForgotMessage("");
            setForgotCodeHint("");
            setForgotCode("");
            setForgotNewPassword("");
            setForgotConfirmPassword("");
            setForgotEmail(String(loginData.email || "").trim());
            setScreen("forgot");
          }}
        />
      ) : screen === "register" ? (
        <RegisterScreen
          form={registerForm}
          verificationCode={verificationCode}
          onChangeVerificationCode={setVerificationCode}
          onSendCode={onSendRegistrationCode}
          sendCodeLoading={sendCodeLoading}
          codeHint={registerCodeHint}
          apiBaseUrl={API_BASE_URL}
          onChange={handleRegisterChange}
          message={message}
          loading={loading}
          onSubmit={onRegisterPress}
          onGoLogin={() => {
            setMessage("");
            setRegisterCodeHint("");
            setVerificationCode("");
            setScreen("login");
          }}
        />
      ) : (
        <ForgotPasswordScreen
          email={forgotEmail}
          onChangeEmail={setForgotEmail}
          verificationCode={forgotCode}
          onChangeVerificationCode={setForgotCode}
          newPassword={forgotNewPassword}
          onChangeNewPassword={setForgotNewPassword}
          confirmPassword={forgotConfirmPassword}
          onChangeConfirmPassword={setForgotConfirmPassword}
          onSendCode={onSendForgotPasswordCode}
          sendCodeLoading={forgotSendLoading}
          codeHint={forgotCodeHint}
          message={forgotMessage}
          loading={loading}
          onSubmit={onForgotPasswordSubmit}
          onGoLogin={() => {
            resetForgotForm();
            setScreen("login");
          }}
        />
      )}
    </AuthLayout>
  );
}
