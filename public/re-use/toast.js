async function toast (data){

    sessionStorage.setItem('toastMessage', data?.message ?? "Updated successfully");
    window.location.reload();
}

window.addEventListener('DOMContentLoaded', () => {
    const message = sessionStorage.getItem('toastMessage');
    if (message) {
        Toastify({
            text: message,
            duration: 1500,
            close: true,
            gravity: "top",
            position: "right",
            backgroundColor: "#28a745",
            stopOnFocus: true,
            style: {
                borderRadius: "10px",
                padding: "10px 20px",
                fontWeight: "500",
            }
        }).showToast();

        // Remove message after showing once
        sessionStorage.removeItem('toastMessage');
    }
});