package me.tech.packetlogger;

import com.github.retrooper.packetevents.event.ProtocolPacketEvent;
import com.github.retrooper.packetevents.netty.buffer.ByteBufHelper;
import com.github.retrooper.packetevents.protocol.PacketSide;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public final class PacketCaptureService {
    public static final int DEFAULT_COUNT = 200;
    public static final int MAX_COUNT = 5000;

    private final BatchedPacketsService batchedPacketsService;
    private final Map<UUID, ActiveCapture> captures = new ConcurrentHashMap<>();

    public PacketCaptureService(
            final BatchedPacketsService batchedPacketsService
    ) {
        this.batchedPacketsService = batchedPacketsService;
    }

    /**
     * Start capturing a player's packets.
     * @param player the player to capture
     * @param count how many packets to keep
     * @param requester who is told when the capture is saved
     * @return false if the player is already being captured
     */
    public boolean start(Player player, int count, CommandSender requester) {
        final var capture = new ActiveCapture(
                Instant.now().toEpochMilli(), player.getUniqueId(), player.getName(), count, requester
        );
        return captures.putIfAbsent(player.getUniqueId(), capture) == null;
    }

    /**
     * Record a packet if its player is being captured.
     * @param event the dispatched packet event
     */
    public void add(ProtocolPacketEvent event) {
        // Called for every packet on the server, so bail out as early as possible.
        if(captures.isEmpty()) {
            return;
        }
        final UUID uuid = event.getUser().getUUID();
        if(uuid == null) {
            return;
        }
        final var capture = captures.get(uuid);
        if(capture == null) {
            return;
        }

        final String packetName = event.getPacketType().getName();
        final boolean outgoing = event.getPacketType().getSide() == PacketSide.SERVER;
        final int size = ByteBufHelper.readableBytes(event.getByteBuf());
        final String data = PacketJson.toJson(event);

        if(capture.add(new CapturedPacket(packetName, outgoing, size, Instant.now().toEpochMilli(), data))) {
            finish(uuid);
        }
    }

    /**
     * Save a player's capture, even if it hasn't reached its count yet.
     * @param uuid the captured player
     */
    public void finish(UUID uuid) {
        final var active = captures.remove(uuid);
        if(active == null) {
            return;
        }

        final var capture = active.toCapture();
        batchedPacketsService.addCapture(capture);
        active.requester.sendMessage(Component.text(
                "Saved %d packets from %s to plugins/packet-logger/%s/%s".formatted(
                        capture.packets().size(), capture.playerName(), Constants.DB_FOLDER_NAME, Constants.SQLITE_FILE_NAME
                ),
                NamedTextColor.GREEN
        ));
    }

    /**
     * Save every unfinished capture right away, for when the plugin is disabled.
     */
    public void finishAll() {
        for(final var uuid : captures.keySet()) {
            final var active = captures.remove(uuid);
            if(active != null) {
                batchedPacketsService.insertCapture(active.toCapture());
            }
        }
    }

    public record CapturedPacket(String name, boolean outgoing, int sizeBytes, long capturedAt, String data) {
    }

    public record Capture(long id, UUID playerUuid, String playerName, List<CapturedPacket> packets) {
    }

    private static final class ActiveCapture {
        private final long id;
        private final UUID playerUuid;
        private final String playerName;
        private final int count;
        private final CommandSender requester;
        private final List<CapturedPacket> packets = new ArrayList<>();

        private ActiveCapture(long id, UUID playerUuid, String playerName, int count, CommandSender requester) {
            this.id = id;
            this.playerUuid = playerUuid;
            this.playerName = playerName;
            this.count = count;
            this.requester = requester;
        }

        /**
         * Packets arrive on network threads, so adding is synchronized.
         * @return true when this packet filled the capture
         */
        private synchronized boolean add(CapturedPacket packet) {
            if(packets.size() >= count) {
                return false;
            }
            packets.add(packet);
            return packets.size() == count;
        }

        private synchronized Capture toCapture() {
            return new Capture(id, playerUuid, playerName, List.copyOf(packets));
        }
    }
}