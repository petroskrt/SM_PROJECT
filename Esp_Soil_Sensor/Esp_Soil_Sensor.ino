#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

//wifi settings
const char *ssid = "Vayan Office";
const char *password = "B@nana1996";

//mqtt broker settings
const char *mqtt_broker = "broker.emqx.io"; // emqx broker endpoint
const char *mqtt_topic = "esp8266/test"; // mqtt topic
const char *mqtt_username = "emqx_test";
const char *mqtt_password = "emqx_test";
const int mqtt_port = 1883; // mqtt tcp port

#define sensorPIN A0
unsigned long previousMillis = 0;

WiFiClient espClient;
PubSubClient client(espClient);

void setup() {
  Serial.begin(9600);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.println("Connecting to WiFi...");
  }
  Serial.println("Connected to the WiFi network");
  //connecting to mqtt broker
   client.setServer(mqtt_broker, mqtt_port);
  while(!client.connected()) {
    String client_id = "esp8266-client-";
    client_id += String(WiFi.macAddress());
    Serial.printf("The client %s connects to the public mqtt broker\n", client_id.c_str());
    if(client.connect(client_id.c_str(), mqtt_username, mqtt_password)) {
      Serial.println("Public emqx mqtt broker connected");
    } else {
      Serial.print("failed with state ");
      Serial.print(client.state());
      delay(2000);
    }
  }
}


void loop() {
  client.loop();
  unsigned long currentMillis = millis();
  // data are published every 5 seconds
  if (currentMillis - previousMillis >= 5000) {
    previousMillis = currentMillis;
    float moistureValue = analogRead(sensorPIN);

    //json serialize
    DynamicJsonDocument data(256);
    data["moisture"] = moistureValue;
    //publish moisture
    char json_string[256];
    serializeJson(data, json_string);
    
    Serial.println(json_string);
    client.publish(mqtt_topic, json_string, false);
  }
}