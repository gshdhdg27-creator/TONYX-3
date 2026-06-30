import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "tonyx_telegram_id";

interface UserContextValue {
  telegramId: string | null;
  isReady: boolean;
  setTelegramId: (id: string) => Promise<void>;
  clearTelegramId: () => Promise<void>;
}

const UserContext = createContext<UserContextValue>({
  telegramId: null,
  isReady: false,
  setTelegramId: async () => {},
  clearTelegramId: async () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [telegramId, setTelegramIdState] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((val) => {
        if (val) setTelegramIdState(val);
        setIsReady(true);
      })
      .catch(() => setIsReady(true));
  }, []);

  const setTelegramId = async (id: string) => {
    await AsyncStorage.setItem(STORAGE_KEY, id);
    setTelegramIdState(id);
  };

  const clearTelegramId = async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setTelegramIdState(null);
  };

  return (
    <UserContext.Provider
      value={{ telegramId, isReady, setTelegramId, clearTelegramId }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
