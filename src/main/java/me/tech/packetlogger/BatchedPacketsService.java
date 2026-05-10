package me.tech.packetlogger;

import com.github.retrooper.packetevents.event.ProtocolPacketEvent;
import com.github.retrooper.packetevents.netty.buffer.ByteBufHelper;
import com.github.retrooper.packetevents.protocol.PacketSide;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

public final class BatchedPacketsService {
    private static final Logger log = LoggerFactory.getLogger(BatchedPacketsService.class);

    private final PacketLoggerPlugin plugin;
    private final Path dataFolderPath;
    private final ExecutorService executor;

    private final Set<String> packetBoundCache = ConcurrentHashMap.newKeySet();
    private final Map<String, PacketRecord> packetQueue = new ConcurrentHashMap<>();

    public BatchedPacketsService(
        final PacketLoggerPlugin plugin
    ) {
        this.plugin = plugin;
        this.dataFolderPath = plugin.getDataFolder().toPath();
        this.executor = Executors.newSingleThreadExecutor();

        createSqlite();
    }

    /**
     * Add a packet to the queue.
     * @param event the dispatched packet event
     */
    public void add(ProtocolPacketEvent event) {
        final String packetName = event.getPacketType().getName();
        final int size = ByteBufHelper.readableBytes(event.getByteBuf());
        final boolean outgoing = event.getPacketType().getSide() == PacketSide.SERVER;

        if(!packetBoundCache.contains(packetName)) {
            packetBoundCache.add(packetName);
            // quickly add to db.
            executor.submit(() -> addPacketBound(packetName, outgoing));
        }

        final var record = packetQueue.computeIfAbsent(packetName, (k) -> new PacketRecord());
        record.amount.getAndIncrement();
        record.size.getAndAdd(size);
    }

    /**
     * Start publishing packet batches to the SQLite database.
     */
    public void startPublish() {
        final var flushSeconds = plugin.getConfig().getInt("flush-seconds", 5);

        final var scheduler = plugin.getServer().getAsyncScheduler();
        scheduler.runAtFixedRate(plugin, (task) -> {
            executor.submit(this::flush);
        }, 0L, flushSeconds, TimeUnit.SECONDS);
    }

    /**
     * Flush the contents of the queue into SQLite.
     */
    public void flush() {
        try(final var conn = getConnection()) {
            conn.setAutoCommit(false);
            final String sql = "INSERT INTO batched_packets (packet_name, amount, size_bytes, collected_at) VALUES (?, ?, ?, ?)";

            final var counter = new AtomicInteger();
            final var nowMs = Instant.now().toEpochMilli();

            try(final var statement = conn.prepareStatement(sql)) {
                for(final var packet : packetQueue.keySet()) {
                    final var record = packetQueue.get(packet);
                    final var amount = record.amount.get();
                    final var size = record.size.get();

                    statement.setObject(1, packet);
                    statement.setObject(2, amount);
                    statement.setObject(3, size);
                    statement.setObject(4, nowMs);
                    statement.addBatch();

                    if(counter.getAndIncrement() % 15 == 0) {
                        statement.executeBatch();
                        conn.commit();
                    }
                }

                // flush final batch
                statement.executeBatch();
                conn.commit();
            } catch(SQLException ex) {
                conn.rollback();
                log.error("Unable to flush packet batch to SQLite.", ex);
            } finally {
                conn.setAutoCommit(true);
            }
        } catch(SQLException ex) {
            log.error("Unable to open SQLite connection for packet batch flush.", ex);
        }

        packetQueue.clear();
    }

    /**
     * Add a packet bound to the SQLite database.
     * @param packetName the packet name
     * @param outgoing whether it's incoming or outgoing
     */
    private void addPacketBound(String packetName, boolean outgoing) {
        try(final var conn = getConnection()) {
            final String sql = "INSERT INTO packet_bound (packet_name, outgoing) VALUES (?, ?)";

            try(final var statement = conn.prepareStatement(sql)) {
                statement.setString(1, packetName);
                statement.setBoolean(2, outgoing);

                statement.executeUpdate();
            } catch(SQLException ex) {
                log.error("Unable to persist packet bound for packet {}.", packetName, ex);
            }
        } catch(SQLException ex) {
            log.error("Unable to open SQLite connection for packet bound persistence.", ex);
        }
    }

    /**
     * Create the SQLite Database
     * This method will create the `batched_packets` table which contains the actual
     * packet information
     * And this method will create the `packet_bound` table which contains whether a packet is
     * incoming or outgoing which will then be joined into the graph.
     */
    private void createSqlite() {
        final var dbFolder = dataFolderPath.resolve(Constants.DB_FOLDER_NAME);
        if(!Files.exists(dbFolder)) {
            try {
                Files.createDirectory(dbFolder);
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
        }

        final var dbFile = dataFolderPath.resolve(Constants.DB_FOLDER_NAME)
            .resolve(Constants.SQLITE_FILE_NAME);
        if(!Files.exists(dbFile)) {
            try {
                Files.createFile(dbFile);
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
        }

        try (var conn = getConnection()) {
            conn.createStatement()
                .execute("CREATE TABLE IF NOT EXISTS batched_packets (" +
                    "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
                    "packet_name TEXT NOT NULL, " +
                    "amount INTEGER NOT NULL," +
                    "size_bytes INTEGER NOT NULL, " +
                    "collected_at INTEGER NOT NULL" +
                    ");");

            conn.createStatement()
                    .execute("CREATE TABLE IF NOT EXISTS packet_bound (" +
                        "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
                        "packet_name TEXT NOT NULL, " +
                        "outgoing INTEGER NOT NULL " +
                        ");");
            log.info("Created batched_packets table in SQLite DB.");
        } catch (SQLException ex) {
            throw new RuntimeException(ex);
        }
    }

    /**
     * Grab a new SQLite Connection
     * @return the {@link Connection}
     * @throws SQLException if the driver manager failed
     */
    private Connection getConnection() throws SQLException {
        return DriverManager.getConnection(
            "jdbc:sqlite:%s".formatted(getDBFilePath().toAbsolutePath())
        );
    }

    /**
     * Get the path to the SQLite file
     * @return the {@link Path} to the SQLite file
     */
    private Path getDBFilePath() {
        return dataFolderPath.resolve(Constants.DB_FOLDER_NAME)
            .resolve(Constants.SQLITE_FILE_NAME);
    }

    private record PacketRecord(AtomicInteger amount, AtomicLong size) {
        public PacketRecord() {
            this(new AtomicInteger(0), new AtomicLong(0));
        }
    }
}
