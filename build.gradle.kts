import com.github.jengelman.gradle.plugins.shadow.tasks.ShadowJar

plugins {
    id("java")
    id("com.gradleup.shadow") version "8.3.5"
    id("net.minecrell.plugin-yml.bukkit") version "0.6.0"
}

group = "me.tech"
version = "1.0-SNAPSHOT"

repositories {
    mavenCentral()

    maven {
        name = "papermc"
        url = uri("https://repo.papermc.io/repository/maven-public/")
    }

    maven("https://repo.codemc.io/repository/maven-releases/")
    maven("https://repo.codemc.io/repository/maven-snapshots/")
    maven("https://repo.dmulloy2.net/repository/public/")
}

dependencies {
    compileOnly("io.papermc.paper:paper-api:1.20.6-R0.1-SNAPSHOT")
    compileOnly("org.bstats:bstats-bukkit:3.0.2")

    implementation("com.github.retrooper:packetevents-spigot:2.6.0")
}


java {
    toolchain.languageVersion.set(JavaLanguageVersion.of(21))
}

tasks.withType<ShadowJar> {
    relocate("com.github.retrooper.packetevents", "me.tech.packetlogger.packetevents.api")
    relocate("io.github.retrooper.packetevents", "me.tech.packetlogger.packetevents.impl")
    relocate("org.bstats", "me.tech.bstats")

    minimize()
}

bukkit {
    main = "me.tech.packetlogger.PacketLoggerPlugin"
    authors = listOf("DebitCardz").sorted()
    apiVersion = "1.20"
}