dependencies {
    implementation("com.fasterxml.jackson.core:jackson-databind")
    implementation(project(":shared"))

    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-webflux")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.session:spring-session-core")

    // Lombok: @Slf4j only (AGENTS.md §2b/§2c) — BOM-managed version
    compileOnly("org.projectlombok:lombok")
    annotationProcessor("org.projectlombok:lombok")

    runtimeOnly("org.postgresql:postgresql")

    testImplementation("org.wiremock:wiremock-standalone:3.9.1")
}
