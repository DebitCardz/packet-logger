package me.tech.packetlogger;

import com.github.retrooper.packetevents.PacketEvents;
import com.github.retrooper.packetevents.event.*;
import org.bukkit.Bukkit;
import org.bukkit.event.Listener;
import org.bukkit.plugin.java.JavaPlugin;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;

public final class PacketLoggerPlugin extends JavaPlugin implements Listener {
    private static final Logger log = LoggerFactory.getLogger(PacketLoggerPlugin.class);

    private static final int SERVICE_ID = 24008;
    private static final DateTimeFormatter FOLDER_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private BatchedPacketsService batchedPacketsService;
    private BukkitMetrics metrics;

    @Override
    public void onEnable() {
        saveDefaultConfig();

        metrics = new BukkitMetrics(this, SERVICE_ID);
        purge();

        this.batchedPacketsService = new BatchedPacketsService(this);
        batchedPacketsService.startPublish();

        PacketEvents.getAPI().getEventManager().registerListener(new PacketListener() {
            @Override
            public void onPacketSend(PacketSendEvent event) {
                batchedPacketsService.add(event);
            }

            @Override
            public void onPacketReceive(PacketReceiveEvent event) {
                batchedPacketsService.add(event);
            }
        }, PacketListenerPriority.MONITOR);
    }

    @Override
    public void onDisable() {
        Bukkit.getAsyncScheduler().cancelTasks(this);
        metrics.shutdown();

        batchedPacketsService.flush();
    }

    /**
     * Purge old packet logs.
     */
    private void purge() {
        final var purgeDays = getConfig().getInt("purge-days", 14);
        log.info("Packet Logs will be purged after {} days.", purgeDays);

        final var now = LocalDateTime.now();
        final var files = getDataFolder().listFiles();
        if(files == null) {
            log.warn("No files were found in data folder to purge.");
            return;
        }

        for(final var folder : files) {
            if(!folder.isDirectory()) {
                continue;
            }

            final var date = LocalDate.parse(folder.getName(), FOLDER_FORMAT);
            final var daysBetween = ChronoUnit.DAYS.between(date, now);

            if(daysBetween < purgeDays) {
                continue;
            }

            Bukkit.getAsyncScheduler().runNow(this, task -> {
                deleteRecursively(folder);
                folder.delete();
            });
            log.info("Purged {}", folder.getName());
        }
    }

    /**
     * Recursively delete a folder
     * @param file the parent
     */
    private void deleteRecursively(final File file) {
        if(file.isDirectory()) {
            for(final var child : file.listFiles()) {
                deleteRecursively(child);
            }
        }
        if(!file.delete()) {
            log.error("Unable to delete {}", file.getName());
        }
    }
}
