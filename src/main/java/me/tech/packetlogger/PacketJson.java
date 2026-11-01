package me.tech.packetlogger;

import com.github.retrooper.packetevents.event.PacketReceiveEvent;
import com.github.retrooper.packetevents.event.PacketSendEvent;
import com.github.retrooper.packetevents.event.ProtocolPacketEvent;
import com.github.retrooper.packetevents.netty.buffer.ByteBufHelper;
import com.github.retrooper.packetevents.protocol.mapper.MappedEntity;
import com.github.retrooper.packetevents.protocol.packettype.PacketType;
import com.github.retrooper.packetevents.resources.ResourceLocation;
import com.github.retrooper.packetevents.wrapper.PacketWrapper;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;

import java.lang.reflect.Array;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Modifier;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.serializer.gson.GsonComponentSerializer;

/**
 * Turns a packet into JSON by reading it with its PacketEvents wrapper and walking the wrapper's fields.
 * Packets without a wrapper, or that fail to decode, fall back to their raw bytes as hex.
 */
final class PacketJson {
    private static final String WRAPPER_PACKAGE = "com.github.retrooper.packetevents.wrapper.play.";

    /** Caps that keep huge packets like chunk data from turning into megabytes of JSON. */
    private static final int MAX_DEPTH = 6;
    private static final int MAX_ELEMENTS = 64;
    private static final int MAX_NODES = 2000;
    private static final int MAX_BYTES = 256;

    /** Wrapper constructor per packet, looked up once. Empty when PacketEvents has no wrapper for it. */
    private static final Map<String, Optional<Constructor<?>>> CONSTRUCTORS = new ConcurrentHashMap<>();

    private int nodes;

    private PacketJson() {
    }

    /**
     * Decode a packet into a JSON string.
     * @param event the dispatched packet event
     * @return the packet's fields, or its raw bytes when it can't be decoded
     */
    static String toJson(ProtocolPacketEvent event) {
        final Object buffer = event.getByteBuf();
        final int readerIndex = ByteBufHelper.readerIndex(buffer);
        try {
            if(!(event.getPacketType() instanceof PacketType.Play.Server) && !(event.getPacketType() instanceof PacketType.Play.Client)) {
                return raw(buffer, readerIndex, "not a play packet").toString();
            }

            final var constructor = constructorFor(event);
            if(constructor.isEmpty()) {
                return raw(buffer, readerIndex, "no PacketEvents wrapper for this packet").toString();
            }

            final Object wrapper = constructor.get().newInstance(event);
            return new PacketJson().fields(wrapper, 0).toString();
        } catch(ReflectiveOperationException | RuntimeException | LinkageError ex) {
            final Throwable cause = ex instanceof InvocationTargetException invocation ? invocation.getCause() : ex;
            return raw(buffer, readerIndex, "could not decode: " + cause).toString();
        } finally {
            // Leave the buffer as we found it so the packet still reaches the server or client intact.
            ByteBufHelper.readerIndex(buffer, readerIndex);
        }
    }

    /**
     * Find the wrapper constructor for a packet.
     * PacketEvents names wrappers after the packet: ENTITY_HEAD_LOOK is WrapperPlayServerEntityHeadLook.
     */
    private static Optional<Constructor<?>> constructorFor(ProtocolPacketEvent event) {
        final boolean outgoing = event instanceof PacketSendEvent;
        final String packetName = event.getPacketType().getName();

        return CONSTRUCTORS.computeIfAbsent((outgoing ? "server:" : "client:") + packetName, (k) -> {
            final var className = new StringBuilder(WRAPPER_PACKAGE)
                    .append(outgoing ? "server.WrapperPlayServer" : "client.WrapperPlayClient");
            for(final String word : packetName.split("_")) {
                className.append(word.charAt(0)).append(word.substring(1).toLowerCase(Locale.ROOT));
            }

            try {
                final var type = Class.forName(className.toString(), false, PacketWrapper.class.getClassLoader());
                return Optional.of(type.getConstructor(outgoing ? PacketSendEvent.class : PacketReceiveEvent.class));
            } catch(ReflectiveOperationException ex) {
                return Optional.empty();
            }
        });
    }

    /**
     * An object's fields as JSON, skipping the wrapper's own bookkeeping like its buffer and user.
     */
    private JsonObject fields(Object object, int depth) {
        final var json = new JsonObject();
        for(Class<?> type = object.getClass(); type != null && type != PacketWrapper.class && type != Object.class; type = type.getSuperclass()) {
            for(final Field field : type.getDeclaredFields()) {
                if(Modifier.isStatic(field.getModifiers()) || field.isSynthetic() || json.has(field.getName())) {
                    continue;
                }

                try {
                    field.setAccessible(true);
                    json.add(field.getName(), value(field.get(object), depth + 1));
                } catch(ReflectiveOperationException | RuntimeException | LinkageError ex) {
                    json.addProperty(field.getName(), "<unreadable>");
                }
            }
        }
        return json;
    }

    private JsonElement value(Object value, int depth) {
        if(value == null) {
            return JsonNull.INSTANCE;
        }
        if(++nodes > MAX_NODES) {
            return new JsonPrimitive("<truncated>");
        }

        if(value instanceof Boolean bool) return new JsonPrimitive(bool);
        if(value instanceof Number number) return new JsonPrimitive(number);
        if(value instanceof CharSequence || value instanceof Character || value instanceof UUID) return new JsonPrimitive(value.toString());
        if(value instanceof Enum<?> constant) return new JsonPrimitive(constant.name());
        if(value instanceof Optional<?> optional) return value(optional.orElse(null), depth);
        if(value instanceof ResourceLocation location) return new JsonPrimitive(location.toString());
        // Registry entries like item and entity types read best as their id, e.g. minecraft:stone.
        if(value instanceof MappedEntity entity) return new JsonPrimitive(entity.getName().toString());
        if(value instanceof byte[] bytes) return new JsonPrimitive(hex(bytes, bytes.length));

        // Chat text, titles and item names Adventure components, stored as the JSON client receives.
        if(value instanceof Component component) return GsonComponentSerializer.gson().serializeToTree(component);

        if(depth >= MAX_DEPTH) {
            return new JsonPrimitive(String.valueOf(value));
        }

        if(value.getClass().isArray()) {
            final var json = new JsonArray();
            final int length = Array.getLength(value);
            for(int i = 0; i < Math.min(length, MAX_ELEMENTS); i++) {
                json.add(value(Array.get(value, i), depth + 1));
            }
            if(length > MAX_ELEMENTS) {
                json.add("<%d more>".formatted(length - MAX_ELEMENTS));
            }
            return json;
        }

        if(value instanceof Iterable<?> iterable) {
            final var json = new JsonArray();
            int skipped = 0;
            for(final Object element : iterable) {
                if(json.size() < MAX_ELEMENTS) {
                    json.add(value(element, depth + 1));
                } else {
                    skipped++;
                }
            }
            if(skipped > 0) {
                json.add("<%d more>".formatted(skipped));
            }
            return json;
        }

        if(value instanceof Map<?, ?> map) {
            final var json = new JsonObject();
            for(final var entry : map.entrySet()) {
                if(json.size() >= MAX_ELEMENTS) {
                    json.addProperty("<truncated>", "%d more".formatted(map.size() - MAX_ELEMENTS));
                    break;
                }
                json.add(String.valueOf(entry.getKey()), value(entry.getValue(), depth + 1));
            }
            return json;
        }

        // Only walk into PacketEvents' own types; anything else (Netty, Adventure, the JDK) is shown as text.
        if(value.getClass().getName().startsWith("com.github.retrooper.packetevents.")) {
            return fields(value, depth);
        }
        return new JsonPrimitive(String.valueOf(value));
    }

    /**
     * The packet's raw bytes, for packets that can't be decoded.
     */
    private static JsonObject raw(Object buffer, int readerIndex, String reason) {
        final int length = ByteBufHelper.writerIndex(buffer) - readerIndex;
        final var bytes = new byte[Math.min(length, MAX_BYTES)];
        ByteBufHelper.getBytes(buffer, readerIndex, bytes);

        final var json = new JsonObject();
        json.addProperty("undecoded", reason);
        json.addProperty("hex", hex(bytes, length));
        return json;
    }

    /**
     * Hex for the first bytes, noting the full length when it's cut short.
     */
    private static String hex(byte[] bytes, int totalLength) {
        final int shown = Math.min(bytes.length, MAX_BYTES);
        final String hex = HexFormat.of().formatHex(bytes, 0, shown);
        return shown < totalLength ? "%s... (%d bytes)".formatted(hex, totalLength) : hex;
    }
}
