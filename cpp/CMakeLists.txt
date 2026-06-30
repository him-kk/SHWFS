cmake_minimum_required(VERSION 3.16)
project(ao_pro VERSION 1.0.0 LANGUAGES C CXX)

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)

# Source files
set(AO_CORE_SOURCES
    src/preprocessing.c
    src/centroiding.c
    src/wavefront_recon.c
    src/turbulence.c
    src/dm_control.c
    src/hysteresis.c
    src/control.c
    src/spgd_backup.c
    src/pipeline.c
)

# Include directories
include_directories(include)

# Native library (for testing)
add_library(ao_pro_native STATIC ${AO_CORE_SOURCES})
target_link_libraries(ao_pro_native PUBLIC m)

# WebAssembly build (only with Emscripten)
if(EMSCRIPTEN)
    add_executable(ao_pro_wasm ${AO_CORE_SOURCES} wasm/bindings.cpp)
    
    set_target_properties(ao_pro_wasm PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY ${CMAKE_SOURCE_DIR}/../public
    )
    
    target_link_options(ao_pro_wasm PRIVATE
        "-sEXPORT_ES6=1"
        "-sMODULARIZE=1"
        "-sEXPORT_NAME='AOProModule'"
        "-sALLOW_MEMORY_GROWTH=1"
        "-sINITIAL_MEMORY=64MB"
        "-sMAXIMUM_MEMORY=512MB"
        "-sEXPORTED_FUNCTIONS=['_malloc','_free']"
        "-sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','getValue','setValue','HEAPU16','HEAPF64']"
        "-sENVIRONMENT=web"
        "-O3"
        "--bind"
    )
    
    target_link_libraries(ao_pro_wasm PUBLIC m)
endif()
