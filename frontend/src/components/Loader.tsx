import { Box, CircularProgress, Typography } from "@mui/material";

export default function Loader({ texto }: { texto?: string }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5, py: 8 }} role="status">
      <CircularProgress size={28} thickness={4} />
      {texto && (
        <Typography variant="body2" color="text.secondary">
          {texto}
        </Typography>
      )}
    </Box>
  );
}
