#include <Arduino.h>

// Пины реле и кнопок (подставь свои, если отличаются)
const int relayPins[4] = {3, 4, 5, 7};
const int buttonPins[4] = {10, 9, 6, 8};

// Если true — реле активны по LOW (LOW = ON, HIGH = OFF).
// Если false — реле активны по HIGH (HIGH = ON, LOW = OFF).
const bool ACTIVE_LOW = false;

bool relayState[4] = {false, false, false, false}; // логическое состояние: true = ON, false = OFF
bool lastButtonState[4] = {HIGH, HIGH, HIGH, HIGH};

void setRelayPhysical(int i, bool on) {
  // выставляем физический уровень в зависимости от типа реле
  if (ACTIVE_LOW) {
    digitalWrite(relayPins[i], on ? LOW : HIGH);
  } else {
    digitalWrite(relayPins[i], on ? HIGH : LOW);
  }
}

void setRelay(int i, bool on) {
  relayState[i] = on;
  setRelayPhysical(i, on);
  Serial.printf("RELAY%d -> %s\n", i + 1, on ? "ON" : "OFF");
}

void toggleRelay(int i) {
  setRelay(i, !relayState[i]);
  Serial.printf("🔘 BUTTON RELAY%d %s\n", i + 1, relayState[i] ? "ON" : "OFF");
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println("✅ ESP32-C3 4-Relay USB Control Ready");

  for (int i = 0; i < 4; i++) {
    pinMode(relayPins[i], OUTPUT);
    pinMode(buttonPins[i], INPUT_PULLUP); // Кнопки замыкают на GND
  }

  // Явно устанавливаем все реле в OFF при старте
  for (int i = 0; i < 4; i++) {
    setRelayPhysical(i, false); // физически выключаем
    relayState[i] = false;      // логически OFF
  }

  Serial.println("Use commands: RELAY1_ON / RELAY1_OFF ... RELAY4_ON / RELAY4_OFF");
  Serial.printf("ACTIVE_LOW=%s\n", ACTIVE_LOW ? "true (LOW = ON)" : "false (HIGH = ON)");
}

void loop() {
  // --- Проверка кнопок ---
  for (int i = 0; i < 4; i++) {
    bool currentState = digitalRead(buttonPins[i]);
    if (currentState == LOW && lastButtonState[i] == HIGH) {
      delay(50); // антидребезг
      if (digitalRead(buttonPins[i]) == LOW) {
        toggleRelay(i);
      }
    }
    lastButtonState[i] = currentState;
  }

  // --- Проверка входящих USB-команд ---
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();

    if (cmd == "RELAY1_ON")  { setRelay(0, true);  Serial.println("OK RELAY1 ON"); }
    else if (cmd == "RELAY1_OFF") { setRelay(0, false); Serial.println("OK RELAY1 OFF"); }

    else if (cmd == "RELAY2_ON")  { setRelay(1, true);  Serial.println("OK RELAY2 ON"); }
    else if (cmd == "RELAY2_OFF") { setRelay(1, false); Serial.println("OK RELAY2 OFF"); }

    else if (cmd == "RELAY3_ON")  { setRelay(2, true);  Serial.println("OK RELAY3 ON"); }
    else if (cmd == "RELAY3_OFF") { setRelay(2, false); Serial.println("OK RELAY3 OFF"); }

    else if (cmd == "RELAY4_ON")  { setRelay(3, true);  Serial.println("OK RELAY4 ON"); }
    else if (cmd == "RELAY4_OFF") { setRelay(3, false); Serial.println("OK RELAY4 OFF"); }

    else if (cmd == "STATUS") {
      Serial.printf("STATUS: R1=%s R2=%s R3=%s R4=%s\n",
                    relayState[0] ? "ON" : "OFF",
                    relayState[1] ? "ON" : "OFF",
                    relayState[2] ? "ON" : "OFF",
                    relayState[3] ? "ON" : "OFF");
    }

    else if (cmd.length() > 0) {
      Serial.print("❌ UNKNOWN COMMAND: ");
      Serial.println(cmd);
    }
  }
}