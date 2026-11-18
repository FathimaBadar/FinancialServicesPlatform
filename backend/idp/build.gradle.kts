dependencies {
    implementation("com.fasterxml.jackson.core:jackson-databind")
    implementation(project(":shared"))
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.security:spring-security-crypto")
    runtimeOnly("org.postgresql:postgresql")
}
