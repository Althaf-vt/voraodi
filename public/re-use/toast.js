async function toast (data,type){

    if(type){
        sessionStorage.setItem('toastMessage', data?.message ?? "Something went wrong");
        sessionStorage.setItem('toastType',"error");
    }else{
    sessionStorage.setItem('toastMessage', data?.message ?? "Updated successfully");
    sessionStorage.setItem('toastType',"success");
    }
    window.location.reload();
}

window.addEventListener('DOMContentLoaded', () => {
    const message = sessionStorage.getItem('toastMessage');
    const type = sessionStorage.getItem('toastType');
    if (message) {
        Toastify({
            text: message,
            duration: 1500,
            close: true,
            gravity: "top",
            position: "right",
            stopOnFocus: true,
            style: {
                background: type === "error" ? "#dc3545" : "#28a745",
                borderRadius: "10px",
                padding: "10px 20px",
                fontWeight: "500",
            }
        }).showToast();

        // Remove message after showing once
        sessionStorage.removeItem('toastMessage');
        sessionStorage.removeItem('toastType');
    }
});