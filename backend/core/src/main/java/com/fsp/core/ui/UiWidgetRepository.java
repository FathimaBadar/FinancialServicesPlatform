package com.fsp.core.ui;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UiWidgetRepository extends JpaRepository<UiWidget, String> {

    Optional<UiWidget> findById(String id);

    List<UiWidget> findAllByOrderByIdAsc();
}
