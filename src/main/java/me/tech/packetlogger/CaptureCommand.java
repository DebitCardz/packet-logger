package me.tech.packetlogger;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;

import java.util.List;

public final class CaptureCommand implements CommandExecutor, TabCompleter {
    private final PacketCaptureService packetCaptureService;

    public CaptureCommand(
            final PacketCaptureService packetCaptureService
    ) {
        this.packetCaptureService = packetCaptureService;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if(args.length < 2 || !args[0].equalsIgnoreCase("capture")) {
            sender.sendMessage(Component.text("Usage: /%s capture <player> [count]".formatted(label), NamedTextColor.RED));
            return true;
        }

        final var player = Bukkit.getPlayerExact(args[1]);
        if(player == null) {
            sender.sendMessage(Component.text("%s isn't online.".formatted(args[1]), NamedTextColor.RED));
            return true;
        }

        int count = PacketCaptureService.DEFAULT_COUNT;
        if(args.length >= 3) {
            try {
                count = Integer.parseInt(args[2]);
            } catch(NumberFormatException ex) {
                count = -1;
            }
            if(count < 1 || count > PacketCaptureService.MAX_COUNT) {
                sender.sendMessage(Component.text(
                        "Count must be a number from 1 to %d.".formatted(PacketCaptureService.MAX_COUNT), NamedTextColor.RED
                ));
                return true;
            }
        }

        if(!packetCaptureService.start(player, count, sender)) {
            sender.sendMessage(Component.text("%s is already being captured.".formatted(player.getName()), NamedTextColor.RED));
            return true;
        }

        sender.sendMessage(Component.text(
                "Capturing the next %d packets of %s...".formatted(count, player.getName()), NamedTextColor.GRAY
        ));
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String label, String[] args) {
        if(args.length == 1) {
            return List.of("capture");
        }
        // null lets Bukkit suggest online player names.
        if(args.length == 2 && args[0].equalsIgnoreCase("capture")) {
            return null;
        }
        return List.of();
    }
}