# packet-logger

packet-logger is a plugin that simply tracks the packets coming and going from your server and
displays it in a digestible and easy graph.

---

### 🛠 How Does It Work?
packet-logger collects anonymous packet data from your server and the clients connected to your server
which is then saved into a SQLite file every 5 seconds by default.

You can then simply download the SQLite file and parse it using the provided Python script
to analyze the amount of packets and size of those packets.

---

### 🐍 Analyze Using the Python Script
> [!NOTE]
> This script was tested with Python 3.11.4 and Plotly 5.24.1

To analyze your data simply use the [Python Script](https://raw.githubusercontent.com/DebitCardz/packet-logger/refs/heads/main/scripts/graph.py) 
to parse your SQLite file. And use `pip install plotly` so we can create the graphs.

Execute your Python Script by using `python <script>.py --file <file>` or place your script
in the same directory as your SQLite file and rename your SQLite file to `packet.sqlite` for it to parse.

After you've executed the command you'll be prompted to enter whether you want to see all packets, only incoming or only outgoing then
whether you want to see the packets every minute or every hour. After that it'll parse the SQLite file and you'll be greeted
with a visualized representation of your server and client packets.

![Viewer Screenshot](https://github.com/user-attachments/assets/5229b879-de55-4224-ac1d-474f14355587)

---

### 📈 Stats
Here are the statistics of the amount of servers using packet-logger to analyze their data! 🌟

![Stats](https://bstats.org/signatures/bukkit/packet-logger.svg)