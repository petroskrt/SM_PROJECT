// imports and requirements
const mqtt = require('mqtt');
const fs = require('fs');
const readline = require('readline');
const { MongoClient, Timestamp } = require('mongodb');
const express = require('express');
const WebSocket = require('ws');
const { connectionOptions } = require('./connectionCred');

// Configuration object
const config = {
    mongodb: {
        uri: "mongodb+srv://<db@username>:<db@password>@monitoringcluster.ff92g.mongodb.net/?retryWrites=true&w=majority",
        dbName: 'plantMonitor',
        collection: 'soilMoistureReadings'
    },
    mqtt: {
        options: {
            clientId: `mqtt_client_${Math.random().toString(16).slice(2, 8)}`,
            username: 'emqx_test',
            password: 'emqx_test'
        }
    },
    server: {
        port: 3000,
        wsPort: 8080
    }
};

// Load plant data
const plantData = JSON.parse(fs.readFileSync('./plants2.json', 'utf8'));

// PlantMonitor class initialization
class PlantMonitor {
    constructor() {
        this.clients = new Set();      // Stores WebSocket connections 
        this.selectedPlant = null;     // Currently monitored plant
        this.setupExpress();           // Initialize web server
        this.setupWebSocket();         // Initialize WebSocket server
    }

    // Start method
    async start() {
        await this.selectPlant();      // Get user plant selection
        await this.connectMongoDB();   // Connect to mongo database
        this.connectMQTT();            // Connect to MQTT broker
    }

    // Plant Selection Method
    async selectPlant() {
        // Setup Command Line interface
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        this.log('Available plants:');
        plantData.plants.forEach((plant, index) => {
            this.log(`${index + 1}. ${plant.name}`); // Display plant  options
        });

        return new Promise((resolve) => {
            rl.question('Select a plant to monitor (enter number): ', (answer) => {
                const plantIndex = parseInt(answer, 10) - 1;
                
                // Validate selection and set selected plant
                if (plantIndex >= 0 && plantIndex < plantData.plants.length) {
                    this.selectedPlant = plantData.plants[plantIndex];
                    this.log(`Selected plant: ${this.selectedPlant.name}`);
                    resolve();
                } else {
                    this.log('Invalid selection. Using default plant.');
                    this.selectedPlant = plantData.plants[0];   // Default to first plant
                    resolve();
                }
                rl.close();
            });
        });
    }

    // Express Setup
    setupExpress() {
        this.app = express();
        this.app.use(express.static('public')); 
        this.app.listen(config.server.port, () => {
            this.log(`HTTP server running at http://localhost:${config.server.port}`);
        });
    }

    // WebSocket setup
    setupWebSocket() {
        const wss = new WebSocket.Server({ port: config.server.wsPort });
        wss.on('connection', (ws) => {
            this.clients.add(ws);
            ws.on('close', () => this.clients.delete(ws));
        });
    }

    // MongoDB connection:
    async connectMongoDB() {
        try {
            this.mongoClient = new MongoClient(config.mongodb.uri);
            await this.mongoClient.connect();
            this.db = this.mongoClient.db(config.mongodb.dbName);
            this.collection = this.db.collection(config.mongodb.collection);
            this.log('Connected to MongoDB');
        } catch (error) {
            this.log('MongoDB connection error:', error.message);
        }
    }

    // MQTT connection
    connectMQTT() {
        const { protocol, host, port } = connectionOptions;
        const mqttUrl = `${protocol}://${host}:${port}`;
        
        this.mqttClient = mqtt.connect(mqttUrl, {
            ...config.mqtt.options,
            connectTimeout: 4000,
            reconnectPeriod: 1000
        });
        
        // Setup MQTT event handlers
        this.mqttClient.on('connect', () => {
            this.log('Connected to MQTT broker');
            this.mqttClient.subscribe('esp8266/test');
        });

        this.mqttClient.on('reconnect', (error) => {
            this.log(`Reconnecting to MQTT broker:`, error);
        });

        this.mqttClient.on('error', (error) => {
            this.log(`MQTT connection error:`, error);
        });

        this.mqttClient.on('message', (topic, payload) => this.handleMQTTMessage(payload));
    }

    // MQTT message handling
    async handleMQTTMessage(payload) {
        try {
            const data = JSON.parse(payload);
            const moisture = data.moisture;
            
            if (!this.selectedPlant) {
                this.log('No plant selected. Please select a plant first.');
                return;
            }

            // Send data to graph
            this.broadcast({
                type: 'moisture',
                value: moisture,
                timestamp: new Date().toISOString()
            });

            // check moisture levels and save to database
            this.checkMoistureLevel(moisture, this.selectedPlant);
            await this.saveMoistureReading(moisture, this.selectedPlant);
            
            // Always output the moisture value in a consistent format for the graph
            this.log(`Soil Moisture: ${moisture}`);
        } catch (error) {
            this.log('Error processing message:', error.message);
        }
    }

    // Moisture level checking
    checkMoistureLevel(moisture, plant) {
        const { minimum, optimal, maximum } = plant.moistureThresholds;

        // Compare moisture with thresholds and send alerts
        const alerts = plantData.generalGuidelines.alertThreshold;

        if (moisture < minimum) {
            this.log(`Alert: Moisture ${moisture} below minimum ${minimum}. ${alerts.belowMinimum}`);
        } else if (moisture > maximum) {
            this.log(`Alert: Moisture ${moisture} above maximum ${maximum}. ${alerts.aboveMaximum}`);
        } else {
            this.log(`Moisture ${moisture} is within acceptable range (optimal: ${optimal})`);
        }
    }

    // Database saving
    async saveMoistureReading(moisture, plant) {
        const reading = {
            plantName: plant.name,
            scientificName: plant.scientificName,
            moisture,
            timestamp: new Date()
        };
        await this.collection.insertOne(reading);
        this.log('Reading saved to MongoDB');
    }

    // Logging and broadcasting
    log(...args) {
        const message = args.join(' ');
        console.log(message);
        this.broadcast({ type: 'log', message });
    }

    broadcast(message) {
        this.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(message));
            }
        });
    }
}

// Start monitoring
const monitor = new PlantMonitor();
monitor.start();
