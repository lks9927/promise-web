import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

// TODO: 대표님, 아래 붉은색 빈칸을 카카오 비즈니스 심사 기다리시는 동안 파이어베이스 콘솔에서 발급받아 채워주세요!
// (https://console.firebase.google.com/ 에 프로젝트 생성 후 Web 앱 추가하시면 나오는 키입니다)
const firebaseConfig = {
  apiKey: "API_KEY_HERE",
  authDomain: "PROJECT_ID.firebaseapp.com",
  projectId: "PROJECT_ID",
  storageBucket: "PROJECT_ID.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};

let app, messaging;

try {
  app = initializeApp(firebaseConfig);
  messaging = getMessaging(app);
} catch (error) {
  console.log("Firebase Init Error (Config probably missing)", error);
}

export const requestPushPermission = async () => {
  if (!messaging) return null;
  
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      // VAPID 키 세팅 필요: 파이어베이스 콘솔 -> 프로젝트 설정 -> 클라우드 메시징 -> 웹 구성
      const currentToken = await getToken(messaging, { 
        vapidKey: "VAPID_KEY_HERE_구글콘솔에서_발급" 
      });
      return currentToken;
    }
  } catch (error) {
    console.error("An error occurred while retrieving token. ", error);
  }
  return null;
};

export const onMessageListener = () => {
    if(!messaging) return new Promise(() => {});
    return new Promise((resolve) => {
        onMessage(messaging, (payload) => {
        resolve(payload);
        });
    });
};
