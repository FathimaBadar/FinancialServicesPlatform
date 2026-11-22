dependencies {
    implementation("com.fasterxml.jackson.core:jackson-databind")
    // Read-only cross-book checks (plan §2): no own DB, no writes — only probes + paging.
    implementation("org.springframework.boot:spring-boot-starter")
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    compileOnly("org.projectlombok:lombok")
    annotationProcessor("org.projectlombok:lombok")
}
