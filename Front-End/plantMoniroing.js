document.querySelectorAll('.dropdown').forEach(dropdown => {
    dropdown.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
            e.preventDefault();
            dropdown.classList.toggle('active')
        }
    });
});

const terminal = document.getElementById('terminal');
        const moistureValue = document.getElementById('moistureValue');
        const ctx = document.getElementById('moistureChart').getContext('2d');
        
        // Initialize the chart
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Soil Moisture ',
                    data: [],
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1,
                    fill: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Moisture Level (%)'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Time'
                        }
                    }
                },
                animation: {
                    duration: 0
                }
            }
        });

        // Maximum number of points to show on the graph
        const MAX_POINTS = 20;

        // Connect to WebSocket
        const ws = new WebSocket('ws://localhost:8080');

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'log') {
                // Add log entry to terminal
                const logEntry = document.createElement('div');
                logEntry.className = 'log-entry';
                logEntry.textContent = data.message;
                terminal.appendChild(logEntry);
                terminal.scrollTop = terminal.scrollHeight;

                // Try to extract moisture value from the message
                const moistureMatch = data.message.match(/Soil Moisture: (\d+(\.\d+)?)/);
                if (moistureMatch) {
                    const moisture = parseFloat(moistureMatch[1]);
                    updateChart(moisture);
                }
            }
        };

        function updateChart(moisture) {
            // Update current moisture value
            moistureValue.textContent = moisture.toFixed(1);

            // Add new data point
            const now = new Date();
            const timeString = now.toLocaleTimeString();
            
            chart.data.labels.push(timeString);
            chart.data.datasets[0].data.push(moisture);

            // Remove old data points if we exceed MAX_POINTS
            if (chart.data.labels.length > MAX_POINTS) {
                chart.data.labels.shift();
                chart.data.datasets[0].data.shift();
            }

            // Update the chart
            chart.update();
        }

        ws.onclose = () => {
            const logEntry = document.createElement('div');
            logEntry.className = 'log-entry';
            logEntry.style.color = '#ff0000';
            logEntry.textContent = 'Connection to server lost...';
            terminal.appendChild(logEntry);
        };